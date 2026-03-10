type JsonRecord = Record<string, unknown>;
import { authFetch } from './auth';

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

function asJsonRecord(value: unknown): JsonRecord | null {
    if (!value || typeof value !== 'object') return null;
    return value as JsonRecord;
}

function extractItems(payload: JsonRecord): JsonRecord[] {
    const directItems = payload.items;
    if (Array.isArray(directItems)) {
        return directItems.filter((item): item is JsonRecord => !!asJsonRecord(item));
    }

    const nested = asJsonRecord(payload.data);
    const nestedItems = nested?.items;
    if (Array.isArray(nestedItems)) {
        return nestedItems.filter((item): item is JsonRecord => !!asJsonRecord(item));
    }

    return [];
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

function normalizeEtag(rawEtag: string): string {
    return rawEtag.replace(/^"|"$/g, '');
}

export type UploadInitInputItem = {
    originalFilename: string;
    contentType: string;
    size: number;
    clientLastModifiedMs: number;
};

export type UploadInitResultItem = {
    photoId: number;
    originalKey: string;
    uploadUrl: string;
    expiresAtMs: number;
};

export type UploadCommitInputItem = {
    photoId: number;
    originalKey: string;
    etag: string;
    clientLastModifiedMs: number;
};

export type UploadCommitResultItem = {
    photoId: number;
    previewUrl: string;
};

export async function initPhotoUpload(items: UploadInitInputItem[]): Promise<UploadInitResultItem[]> {
    const response = await authFetch(toApiUrl('/api/photos/upload/init'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
    });

    if (!response.ok) {
        throw await buildHttpError(response, '업로드 초기화에 실패했습니다.');
    }

    const payload = (await response.json()) as JsonRecord;
    const parsedItems = extractItems(payload);

    return parsedItems.map((item) => ({
        photoId: asNumber(item.photoId),
        originalKey: asText(item.originalKey),
        uploadUrl: asText(item.uploadUrl),
        expiresAtMs: Number(item.expiresAtMs ?? 0)
    }));
}

export async function putFileToPresignedUrl(
    uploadUrl: string,
    file: File,
    onProgress: (percent: number) => void
): Promise<string> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable || event.total === 0) return;
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
        };

        xhr.onerror = () => {
            reject(new Error(`${file.name} 업로드 중 네트워크 오류가 발생했습니다.`));
        };

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(`${file.name} 업로드에 실패했습니다.`));
                return;
            }

            const rawEtag = xhr.getResponseHeader('ETag');
            if (!rawEtag) {
                reject(new Error('ETag를 수신하지 못했습니다. S3 CORS ExposeHeaders 설정을 확인해주세요.'));
                return;
            }

            onProgress(100);
            resolve(normalizeEtag(rawEtag));
        };

        xhr.send(file);
    });
}

export async function commitPhotoUpload(items: UploadCommitInputItem[]): Promise<UploadCommitResultItem[]> {
    const response = await authFetch(toApiUrl('/api/photos/upload/commit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
    });

    if (!response.ok) {
        throw await buildHttpError(response, '업로드 완료 처리에 실패했습니다.');
    }

    const payload = (await response.json()) as JsonRecord;
    const parsedItems = extractItems(payload);

    return parsedItems.map((item) => ({
        photoId: asNumber(item.photoId),
        previewUrl: asText(item.previewUrl)
    }));
}
