import { authFetch } from './auth';

type JsonRecord = Record<string, unknown>;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

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

async function buildHttpError(response: Response, fallbackMessage: string): Promise<Error> {
    let detail = '';
    try {
        detail = (await response.text()).trim();
    } catch {
        detail = '';
    }

    const suffix = detail
        ? ` (${response.status} ${response.statusText}: ${detail})`
        : ` (${response.status} ${response.statusText})`;
    return new Error(`${fallbackMessage}${suffix}`);
}

export type MemberProfile = {
    memberId: number;
    nickname: string;
    profileImageUrl: string;
};

function parseMemberProfile(payload: unknown): MemberProfile {
    const root = asRecord(payload) ?? {};
    const data = asRecord(root.data) ?? root;

    return {
        memberId: asNumber(data.memberId),
        nickname: asText(data.nickname),
        profileImageUrl: asText(data.profileImageUrl)
    };
}

export async function getMyMember(): Promise<MemberProfile> {
    const response = await authFetch(toApiUrl('/api/members/me'), { method: 'GET' });

    if (!response.ok) {
        throw await buildHttpError(response, '내 정보 조회에 실패했습니다.');
    }

    return parseMemberProfile(await response.json());
}

export async function getMember(memberId: number): Promise<MemberProfile> {
    const response = await authFetch(toApiUrl(`/api/members/${memberId}`), { method: 'GET' });

    if (!response.ok) {
        throw await buildHttpError(response, '회원 정보 조회에 실패했습니다.');
    }

    return parseMemberProfile(await response.json());
}
