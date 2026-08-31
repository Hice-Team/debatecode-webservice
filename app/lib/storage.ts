// Supabase Storage 키 유틸 — 오브젝트 키는 ASCII 안전 문자만 허용된다.
// 한글/공백/특수문자 파일명("스크린샷 (1).png" 등)을 그대로 키에 쓰면
// "Invalid key" 오류로 업로드가 실패하므로, 키는 uuid로 만들고 원본 이름은 label에 보존한다.

export function safeStorageKey(userId: string, filename: string): string {
  // 확장자만 추출해 소문자 영숫자로 제한 (없거나 이상하면 bin)
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : 'bin';
  return `${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
}

/* ---------- 버킷 ---------- */

/**
 * AI Search 첨부 전용 비공개 버킷.
 *
 * 커뮤니티 첨부(community-uploads)는 공개 버킷이다. 공개 글에 붙는 이미지라 그래도 되지만,
 * AI Search 첨부는 이용자가 Drive에서 가져온 개인 문서나 자기 컴퓨터의 소스 코드다.
 * 키가 uuid라 추측은 어려워도, URL 하나가 새면 그대로 열리는 상태였다.
 * 이 버킷은 소유자만 읽을 수 있고(RLS), 앱은 짧은 서명 URL로만 내보낸다.
 */
export const AI_ATTACHMENT_BUCKET = 'ai-attachments';

/**
 * 첨부 하나의 최대 크기 — 10GB.
 *
 * 이 크기를 요청 본문에 실어 보낼 수는 없다(서버리스 본문 상한). 그래서 일정 크기를
 * 넘는 파일은 서명된 업로드 주소를 받아 브라우저에서 스토리지로 직행한다
 * (app/api/ai-search/attachment/signed). 아래 임계값이 그 갈림길이다.
 *
 * 실제로 10GB가 올라가려면 Supabase 프로젝트의 전역 업로드 상한도 함께 올려야 한다
 * (Storage → Settings → Upload file size limit). 무료 플랜 기본값은 50MB다.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 * 1024;

/** 이 크기를 넘으면 서버를 거치지 않고 스토리지로 직접 올린다. */
export const DIRECT_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024;

/**
 * 첨부를 가리키는 앱 내부 주소.
 *
 * 서명 URL은 몇 분이면 만료되므로 DB에 담을 수 없다. 대신 만료되지 않는 이 주소를 담고,
 * 열람 시점에 프록시(app/api/ai-search/file)가 세션을 확인해 서명 URL로 넘긴다.
 */
export function attachmentProxyUrl(path: string): string {
  return `/api/ai-search/file?path=${encodeURIComponent(path)}`;
}

/** 프록시 주소에서 스토리지 키를 되꺼낸다 — 예전 공개 URL이면 null. */
export function attachmentPathFromUrl(url: string): string | null {
  if (!url.startsWith('/api/ai-search/file?')) return null;
  const value = new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('path');
  return value || null;
}

/** 이 주소가 우리 스토리지를 가리키는 내부 첨부 주소인가. */
export function isAttachmentProxyUrl(url: string): boolean {
  return attachmentPathFromUrl(url) !== null;
}
