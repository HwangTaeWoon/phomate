type JsonRecord = Record<string, unknown>;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const GOOGLE_REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI ?? '';

const ACCESS_TOKEN_KEY = 'phomate.accessToken';
const REFRESH_TOKEN_KEY = 'phomate.refreshToken';
const CODE_VERIFIER_KEY = 'phomate.oauth.codeVerifier';
const OAUTH_INFLIGHT_CODE_KEY = 'phomate.oauth.inflightCode';
let oauthCallbackPromise: Promise<boolean> | null = null;

type GoogleLoginResponse = {
    memberId: number;
    accessToken: string;
    refreshToken: string;
};

type ReissueResponse = {
    accessToken: string;
    refreshToken: string;
};

function toApiUrl(path: string): string {
    if (!API_BASE_URL) return path;
    return new URL(path, API_BASE_URL).toString();
}

function asText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

function asNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function asRecord(value: unknown): JsonRecord | null {
    if (!value || typeof value !== 'object') return null;
    return value as JsonRecord;
}

function getBase64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    const base64 = btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createCodeChallenge(verifier: string): Promise<string> {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return getBase64Url(new Uint8Array(digest));
}

function createCodeVerifier(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return getBase64Url(bytes);
}

function mergeHeaders(
    base: HeadersInit | undefined,
    extra: Record<string, string>
): Headers {
    const headers = new Headers(base);
    Object.entries(extra).forEach(([key, value]) => {
        headers.set(key, value);
    });
    return headers;
}

function decodeJwtPayload(token: string): JsonRecord | null {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
        const decoded = atob(padded);
        const parsed = JSON.parse(decoded) as unknown;
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed as JsonRecord;
    } catch {
        return null;
    }
}

function isTokenExpired(token: string): boolean {
    const payload = decodeJwtPayload(token);
    const exp = asNumber(payload?.exp);
    if (!exp) return false;

    // Refresh a little earlier to avoid race near expiry.
    const nowSec = Math.floor(Date.now() / 1000);
    return exp <= nowSec + 20;
}

export function getAccessToken(): string {
    return localStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
}

export function getRefreshToken(): string {
    return localStorage.getItem(REFRESH_TOKEN_KEY) ?? '';
}

export function isAuthenticated(): boolean {
    return !!getAccessToken();
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function googleLogin(
    params: { code: string; redirectUri: string; codeVerifier: string }
): Promise<GoogleLoginResponse> {
    const response = await fetch(toApiUrl('/api/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });

    if (!response.ok) {
        let detail = '';
        try {
            detail = (await response.text()).trim();
        } catch {
            detail = '';
        }

        const suffix = detail
            ? `(${response.status} ${response.statusText}: ${detail})`
            : `(${response.status} ${response.statusText})`;
        throw new Error(`구글 로그인에 실패했습니다. ${suffix}`);
    }

    const payload = (await response.json()) as JsonRecord;
    const data = asRecord(payload.data) ?? payload;

    const accessToken = asText(data.accessToken);
    const refreshToken = asText(data.refreshToken);

    if (!accessToken || !refreshToken) {
        throw new Error('로그인 토큰을 수신하지 못했습니다.');
    }

    return {
        memberId: asNumber(data.memberId),
        accessToken,
        refreshToken
    };
}

export async function reissueToken(): Promise<ReissueResponse> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
        throw new Error('refreshToken이 없습니다. 다시 로그인해주세요.');
    }

    const response = await fetch(toApiUrl('/api/auth/reissue'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
        clearAuthTokens();
        throw new Error(`토큰 재발급에 실패했습니다. (${response.status})`);
    }

    const payload = (await response.json()) as JsonRecord;
    const data = asRecord(payload.data) ?? payload;

    const nextAccessToken = asText(data.accessToken);
    const nextRefreshToken = asText(data.refreshToken);
    if (!nextAccessToken || !nextRefreshToken) {
        clearAuthTokens();
        throw new Error('재발급 토큰 형식이 올바르지 않습니다.');
    }

    setAuthTokens(nextAccessToken, nextRefreshToken);
    return {
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken
    };
}

export async function authFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
    const url = typeof input === 'string'
        ? (input.startsWith('/') ? toApiUrl(input) : input)
        : input.toString();
    let token = getAccessToken();

    if (token && getRefreshToken() && isTokenExpired(token)) {
        try {
            const refreshed = await reissueToken();
            token = refreshed.accessToken;
        } catch {
            clearAuthTokens();
            token = '';
        }
    }

    const firstHeaders = mergeHeaders(init.headers, {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    });

    const firstResponse = await fetch(url, {
        ...init,
        headers: firstHeaders
    });

    if (firstResponse.status !== 401) {
        return firstResponse;
    }

    if (!getRefreshToken()) {
        // Access token only exists but cannot be refreshed; clear stale auth state.
        clearAuthTokens();
        return firstResponse;
    }

    try {
        const refreshed = await reissueToken();
        const retryHeaders = mergeHeaders(init.headers, {
            Authorization: `Bearer ${refreshed.accessToken}`
        });

        const retriedResponse = await fetch(url, {
            ...init,
            headers: retryHeaders
        });

        if (retriedResponse.status === 401) {
            clearAuthTokens();
        }

        return retriedResponse;
    } catch {
        clearAuthTokens();
        return firstResponse;
    }
}

export async function beginGoogleLogin(): Promise<void> {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
        throw new Error('VITE_GOOGLE_CLIENT_ID 또는 VITE_GOOGLE_REDIRECT_URI가 설정되지 않았습니다.');
    }

    const codeVerifier = createCodeVerifier();
    sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);

    const codeChallenge = await createCodeChallenge(codeVerifier);

    const query = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent'
    });

    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`);
}

export async function completeGoogleLoginIfNeeded(): Promise<boolean> {
    if (oauthCallbackPromise) {
        return oauthCallbackPromise;
    }

    oauthCallbackPromise = (async () => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get('code');
    const error = query.get('error');

    if (error) {
        throw new Error(`구글 로그인 오류: ${error}`);
    }

    if (!code) {
        return false;
    }

    const inflightCode = sessionStorage.getItem(OAUTH_INFLIGHT_CODE_KEY);
    if (inflightCode === code) {
        const nextUrl = `${window.location.origin}/`;
        window.history.replaceState({}, document.title, nextUrl);
        return isAuthenticated();
    }

    const redirectUri = GOOGLE_REDIRECT_URI || `${window.location.origin}${window.location.pathname}`;
    const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY) ?? '';

    if (!codeVerifier) {
        throw new Error('로그인 세션 정보(codeVerifier)가 없습니다. 로그인 버튼부터 다시 시작해주세요.');
    }

    sessionStorage.setItem(OAUTH_INFLIGHT_CODE_KEY, code);

    try {
        const result = await googleLogin({
            code,
            redirectUri,
            codeVerifier
        });

        setAuthTokens(result.accessToken, result.refreshToken);
        sessionStorage.removeItem(CODE_VERIFIER_KEY);
        sessionStorage.removeItem(OAUTH_INFLIGHT_CODE_KEY);

        const nextUrl = `${window.location.origin}/`;
        window.history.replaceState({}, document.title, nextUrl);

        return true;
    } catch (error) {
        sessionStorage.removeItem(OAUTH_INFLIGHT_CODE_KEY);
        throw error;
    }
    })();

    try {
        return await oauthCallbackPromise;
    } finally {
        oauthCallbackPromise = null;
    }
}
