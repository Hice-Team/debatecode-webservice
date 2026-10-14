'use client';

// 범용 첨부 업로더 — 크기와 환경에 따라 세 경로 중 하나를 고르고, 진행률과 취소를 준다.
//
//   ① 작은 파일     브라우저 → 우리 서버 → 스토리지      (~4MB 이하)
//   ② 큰 파일       브라우저 → 스토리지, 6MB씩 이어올리기 (TUS resumable)
//   ③ ②가 막히면   브라우저 → 스토리지, 한 번에          (서명된 업로드 주소)
//
// ②가 핵심이다. 예전에는 큰 파일도 통째로 한 번에 PUT했다. 그래서
//   · 동영상처럼 수십~수백 MB짜리는 중간에 끊기면 처음부터 다시,
//   · 요청 본문 상한에 걸리면 "too large"로 그냥 실패,
//   · 진행 상황이 보이지 않아 멈춘 것과 올라가는 중을 구분할 수 없었다.
// 6MB 조각으로 나누면 조각 하나가 실패해도 그 조각만 다시 보내고, 요청 하나의 크기가
// 항상 6MB라 본문 상한에 걸리지 않는다. 남은 것은 스토리지 자체의 파일 크기 상한뿐이다.
import { createClient } from '@/app/lib/supabase/client';
import { AI_ATTACHMENT_BUCKET, DIRECT_UPLOAD_THRESHOLD_BYTES } from '@/app/lib/storage';

export interface UploadOptions {
  /** 0~1. 조각이 올라갈 때마다 불린다. */
  onProgress?: (ratio: number) => void;
  /** 이용자가 취소하면 진행 중인 요청까지 끊는다. */
  signal?: AbortSignal;
}

export type UploadResult = { url: string } | { error: string; canceled?: boolean };

/** Supabase의 resumable 업로드는 마지막 조각을 빼고 정확히 6MB여야 한다. */
const CHUNK_BYTES = 6 * 1024 * 1024;
/** 조각 하나를 다시 시도할 횟수 — 잠깐 끊긴 네트워크 때문에 전체를 버리지 않는다. */
const CHUNK_RETRIES = 3;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* ---------- 공통 ---------- */

class UploadError extends Error {
  constructor(
    message: string,
    readonly tooLarge = false,
  ) {
    super(message);
  }
}

function canceled(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}

/** 서버가 내려 준 오류 문구를 그대로 쓰되, 없으면 상황에 맞는 기본 문구를 만든다. */
async function messageFor(res: Response): Promise<string> {
  if (res.status === 401) return '첨부하려면 로그인이 필요합니다.';
  if (res.status === 429) return '업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  if (res.status === 413) return tooLargeMessage();
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? '첨부 업로드에 실패했습니다.';
}

/**
 * 크기 상한에 걸렸을 때의 안내.
 *
 * 여기까지 왔다는 것은 앱의 상한(10GB)은 통과했고 **스토리지 프로젝트 설정**에 막혔다는
 * 뜻이다. 어디를 고쳐야 하는지 적어 주지 않으면 이용자는 "그냥 안 된다"로만 받아들인다.
 */
function tooLargeMessage(): string {
  return '스토리지가 허용하는 파일 크기를 넘었습니다. Supabase → Storage → Settings의 "Upload file size limit"을 올려 주세요. (무료 플랜 기본값 50MB)';
}

/* ---------- ① 서버 경유 ---------- */

async function uploadThroughServer(file: File, options: UploadOptions): Promise<UploadResult> {
  const body = new FormData();
  body.set('file', file);
  const res = await fetch('/api/attachments/upload', {
    method: 'POST',
    body,
    signal: options.signal,
  }).catch(() => null);

  if (canceled(options.signal)) return { error: '업로드를 취소했습니다.', canceled: true };
  if (!res) return { error: '네트워크가 끊겨 업로드하지 못했습니다.' };
  if (!res.ok) return { error: await messageFor(res) };

  options.onProgress?.(1);
  const data = (await res.json()) as { url: string };
  return { url: data.url };
}

/* ---------- 서명된 업로드 표 ---------- */

interface Ticket {
  path: string;
  token: string;
  bucket: string;
  url: string;
}

async function requestTicket(file: File, signal?: AbortSignal): Promise<Ticket> {
  const res = await fetch('/api/attachments/upload/signed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, mime: file.type || undefined }),
    signal,
  }).catch(() => null);
  if (!res) throw new UploadError('네트워크가 끊겨 업로드하지 못했습니다.');
  if (!res.ok) throw new UploadError(await messageFor(res), res.status === 413);
  return (await res.json()) as Ticket;
}

/* ---------- ② 이어올리기(TUS) ---------- */

/** TUS 메타데이터는 값을 base64로 담는다 — 한글 파일명도 안전하게 실린다. */
function encodeMetadata(values: Record<string, string | undefined>): string {
  return Object.entries(values)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => {
      const bytes = new TextEncoder().encode(value);
      const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
      return `${key} ${btoa(binary)}`;
    })
    .join(',');
}

/** 브라우저에 들어 있는 Supabase 액세스 토큰 — 없으면 이어올리기를 쓸 수 없다. */
async function accessToken(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * 조각 하나를 보낸다. fetch가 아니라 XHR을 쓰는 이유는 하나 — 업로드 진행률이다.
 * fetch는 보내는 쪽 진행 상황을 알려 주지 않아, 6MB가 다 갈 때까지 화면이 멈춘 듯 보인다.
 */
function patchChunk(
  url: string,
  offset: number,
  chunk: Blob,
  token: string,
  options: UploadOptions & { total: number },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', url, true);
    xhr.setRequestHeader('Tus-Resumable', '1.0.0');
    xhr.setRequestHeader('Upload-Offset', String(offset));
    xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (ANON_KEY) xhr.setRequestHeader('apikey', ANON_KEY);

    const onAbort = () => xhr.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const cleanup = () => options.signal?.removeEventListener('abort', onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.((offset + event.loaded) / options.total);
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status === 204 || xhr.status === 200) {
        const next = Number(xhr.getResponseHeader('Upload-Offset'));
        resolve(Number.isFinite(next) && next > offset ? next : offset + chunk.size);
        return;
      }
      reject(new UploadError(`조각 전송 실패 (${xhr.status})`, xhr.status === 413));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new UploadError('네트워크가 끊겼습니다.'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('aborted', 'AbortError'));
    };
    xhr.send(chunk);
  });
}

/** 서버가 지금 어디까지 받았는지 되묻는다 — 끊긴 자리부터 이어 보내기 위해. */
async function currentOffset(url: string, token: string): Promise<number | null> {
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      'Tus-Resumable': '1.0.0',
      Authorization: `Bearer ${token}`,
      ...(ANON_KEY ? { apikey: ANON_KEY } : {}),
    },
  }).catch(() => null);
  const value = res?.headers.get('Upload-Offset');
  return value ? Number(value) : null;
}

async function uploadResumable(file: File, ticket: Ticket, options: UploadOptions): Promise<UploadResult> {
  const token = await accessToken();
  if (!token || !SUPABASE_URL) throw new UploadError('resumable-unavailable');

  const create = await fetch(`${SUPABASE_URL}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(file.size),
      'Upload-Metadata': encodeMetadata({
        bucketName: ticket.bucket || AI_ATTACHMENT_BUCKET,
        objectName: ticket.path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      }),
      Authorization: `Bearer ${token}`,
      ...(ANON_KEY ? { apikey: ANON_KEY } : {}),
    },
    signal: options.signal,
  }).catch(() => null);

  if (canceled(options.signal)) throw new DOMException('aborted', 'AbortError');
  // 이 엔드포인트가 없거나 권한이 다르면 조용히 ③으로 물러난다
  if (!create || create.status === 404 || create.status === 405) {
    throw new UploadError('resumable-unavailable');
  }
  if (create.status === 413) throw new UploadError(tooLargeMessage(), true);
  if (create.status !== 201) throw new UploadError('resumable-unavailable');

  const location = create.headers.get('Location');
  if (!location) throw new UploadError('resumable-unavailable');
  const uploadUrl = new URL(location, `${SUPABASE_URL}/storage/v1/upload/resumable`).toString();

  let offset = 0;
  let attempt = 0;
  while (offset < file.size) {
    if (canceled(options.signal)) throw new DOMException('aborted', 'AbortError');
    const chunk = file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size));
    try {
      offset = await patchChunk(uploadUrl, offset, chunk, token, { ...options, total: file.size });
      attempt = 0;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof UploadError && error.tooLarge) throw error;

      attempt += 1;
      if (attempt > CHUNK_RETRIES) throw error;
      // 서버가 실제로 어디까지 받았는지 확인하고 그 자리에서 다시 시작한다
      const resumeAt = await currentOffset(uploadUrl, token);
      if (resumeAt !== null) offset = resumeAt;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  options.onProgress?.(1);
  return { url: ticket.url };
}

/* ---------- ③ 한 번에 보내기 ---------- */

async function uploadSigned(file: File, ticket: Ticket, options: UploadOptions): Promise<UploadResult> {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type || undefined });

  if (canceled(options.signal)) return { error: '업로드를 취소했습니다.', canceled: true };
  if (error) {
    const tooLarge = /exceed|too large|maximum size|payload/i.test(error.message);
    return { error: tooLarge ? tooLargeMessage() : `업로드하지 못했습니다. (${error.message})` };
  }
  options.onProgress?.(1);
  return { url: ticket.url };
}

/* ---------- 진입점 ---------- */

/**
 * 파일 하나를 올리고 열람용 주소를 돌려준다.
 * 어느 경로로 갔는지는 부르는 쪽이 몰라도 된다 — 결과 모양이 같다.
 */
export async function uploadAttachment(file: File, options: UploadOptions = {}): Promise<UploadResult> {
  if (canceled(options.signal)) return { error: '업로드를 취소했습니다.', canceled: true };

  if (file.size <= DIRECT_UPLOAD_THRESHOLD_BYTES) {
    return uploadThroughServer(file, options);
  }

  let ticket: Ticket;
  try {
    ticket = await requestTicket(file, options.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { error: '업로드를 취소했습니다.', canceled: true };
    }
    return { error: error instanceof Error ? error.message : '첨부 업로드에 실패했습니다.' };
  }

  try {
    return await uploadResumable(file, ticket, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { error: '업로드를 취소했습니다.', canceled: true };
    }
    if (error instanceof UploadError && error.tooLarge) return { error: error.message };
    // 이어올리기를 못 쓰는 환경이면 한 번에 보내 본다. 여기서도 막히면 그 이유를 그대로 전한다.
    if (error instanceof UploadError && error.message === 'resumable-unavailable') {
      return uploadSigned(file, ticket, options);
    }
    return { error: error instanceof Error ? error.message : '첨부 업로드에 실패했습니다.' };
  }
}
