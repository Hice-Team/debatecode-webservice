// 히어로 검색바에서 고른 첨부를 대화 화면으로 넘기는 임시 보관소.
// URL 쿼리에 담기엔 길어서 sessionStorage를 쓰고, 대화 화면이 첫 질문에 붙인 뒤 비운다.
export const PENDING_ATTACHMENTS_KEY = 'dc:ai-search:pending-attachments';

/** 무엇을 붙였는가 — 썸네일 모양을 정한다. */
export type AttachmentKind = 'image' | 'file' | 'link' | 'code';
/** 어디서 가져왔는가 — 썸네일의 출처 배지를 정한다. */
export type AttachmentSource = 'local' | 'drive' | 'github' | 'url';

export interface PendingAttachment {
  kind: AttachmentKind;
  name: string;
  url: string;
  mime?: string;
  size?: number;
  source?: AttachmentSource;
  /** 텍스트·코드 첨부의 앞부분 — 썸네일에 몇 줄 보여준다 */
  preview?: string;
  /** 미리보기용 objectURL — 컴포저에서만 쓰고 저장하지 않는다 */
  previewUrl?: string;
}

/** 저장·전송용으로 화면 전용 필드(previewUrl)를 떼어낸다. */
export function toWireAttachment(file: PendingAttachment) {
  const { kind, name, url, mime, size, source, preview } = file;
  return { kind, name, url, mime, size, source, preview };
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|java|c|h|cpp|cc|hpp|cs|go|rs|rb|php|swift|kt|kts|scala|sh|bash|zsh|sql|json|ya?ml|toml|xml|html?|css|scss|less|md|dart|lua|r|m|vue|svelte)$/i;

/** 파일 이름·MIME으로 첨부 종류를 추론한다. */
export function detectKind(name: string, mime?: string): AttachmentKind {
  if (mime?.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (CODE_EXT.test(name)) return 'code';
  return 'file';
}

/* ---------- 미리보기 ---------- */

const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac)$/i;
const TEXT_EXT = /\.(txt|log|csv|tsv|ini|env|gitignore)$/i;

/** 미리보기 창에서 어떤 형태로 열 것인가 — null이면 열지 않는다. */
export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text';

/**
 * 브라우저가 그대로 보여 줄 수 있는 첨부인지 판별한다.
 *
 * MIME을 먼저 믿되, 스토리지가 `application/octet-stream`으로 올려 주는 경우가 흔해
 * 확장자로 한 번 더 본다. 판별에 실패하면 미리보기를 열지 않고 내려받기만 제공한다.
 */
export function previewKindOf(file: { name: string; mime?: string; kind?: AttachmentKind }): PreviewKind | null {
  const mime = file.mime ?? '';
  const name = file.name;

  if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (mime.startsWith('video/') || VIDEO_EXT.test(name)) return 'video';
  if (mime.startsWith('audio/') || AUDIO_EXT.test(name)) return 'audio';
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (mime.startsWith('text/') || TEXT_EXT.test(name) || CODE_EXT.test(name)) return 'text';
  return null;
}

/** 확장자 라벨 — 썸네일 타일에 크게 찍는다. */
export function extLabel(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1 || dot === name.length - 1) return 'FILE';
  return name.slice(dot + 1).toUpperCase().slice(0, 4);
}

/** 사람이 읽는 용량 표기. */
export function formatBytes(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 보관해 둔 첨부를 꺼내고 즉시 비운다(한 번만 쓰이도록). */
export function takePendingAttachments(): PendingAttachment[] {
  try {
    const raw = window.sessionStorage.getItem(PENDING_ATTACHMENTS_KEY);
    if (!raw) return [];
    window.sessionStorage.removeItem(PENDING_ATTACHMENTS_KEY);
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingAttachment[]) : [];
  } catch {
    return [];
  }
}
