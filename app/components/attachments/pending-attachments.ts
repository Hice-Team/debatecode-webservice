// 히어로 검색바에서 고른 첨부를 대화 화면으로 넘기는 임시 보관소.
// URL 쿼리에 담기엔 길어서 sessionStorage를 쓰고, 대화 화면이 첫 질문에 붙인 뒤 비운다.
//
// 첨부는 두 자리로 나뉜다(slotOf).
//   thumb    파일 그 자체 — 입력창 안쪽 가로 캐러셀에 썸네일 카드로 눕는다
//   mention  가져온 출처 — 입력창 본문 안에 '@멘션' 칩으로 앉고 Backspace로 지워진다
export const PENDING_ATTACHMENTS_KEY = 'dc:pending-attachments';

/**
 * 어느 표면에 놓이는가 — 밝은 캔버스(검색바·컴포저)와 어두운 캔버스(에디터 챗).
 * 같은 부품이 두 곳에 다 놓이므로 색을 짝지어 둔다.
 */
export type SurfaceTone = 'light' | 'dark';

/** 무엇을 붙였는가 — 썸네일 모양을 정한다. */
export type AttachmentKind = 'image' | 'file' | 'link' | 'code';
/** 어디서 가져왔는가 — 썸네일의 출처 배지를 정한다. */
export type AttachmentSource = 'local' | 'drive' | 'github' | 'url' | 'project';

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
  /** 오디오에서 뽑아낸 앨범 아트(dataURL) — 있을 때만 썸네일을 그린다 */
  artUrl?: string;
  /**
   * 한 덩어리로 가져온 것들의 이름 — 저장소명(`owner/repo`)이나 프로젝트 폴더명.
   *
   * 저장소 하나를 가져오면 파일이 40개 온다. 이용자가 한 일은 "주소 하나 붙이기"인데
   * 칩이 40개 생기면 자기가 뭘 했는지 알아볼 수 없다. 같은 group끼리 칩 하나로 묶고,
   * 지울 때도 통째로 지운다.
   */
  group?: string;
}

/** 저장·전송용으로 화면 전용 필드(previewUrl·artUrl)를 떼어낸다. */
export function toWireAttachment(file: PendingAttachment) {
  const { kind, name, url, mime, size, source, preview, group } = file;
  return { kind, name, url, mime, size, source, preview, group };
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

/* ---------- 자리(slot) ---------- */

/**
 * 이 첨부가 카드 하나로 서는가, 덩어리로 묶이는가.
 *
 * GitHub·URL·Local 프로젝트는 "파일 하나"가 아니라 **가져온 출처**다. 저장소 하나가
 * 파일 40개로 풀리는데 그걸 전부 카드로 눕히면 캐러셀이 순식간에 남의 저장소로 덮인다.
 * 그래서 이 셋은 덩어리(MentionGroup) 하나에 카드 하나로 서고, 파일 업로드와 Drive만
 * 파일마다 카드를 갖는다.
 */
export type AttachmentSlot = 'thumb' | 'mention';

export function slotOf(file: PendingAttachment): AttachmentSlot {
  if (file.kind === 'link') return 'mention';
  if (file.source === 'github' || file.source === 'url' || file.source === 'project') return 'mention';
  return 'thumb';
}

/**
 * 멘션 칩에 적을 이름.
 *
 * URL 첨부는 **문서의 제목**을 쓴다(서버가 <title>·og:title에서 뽑아 name에 넣어 둔다).
 * 호스트명(`docs.python.org`)은 무엇을 붙였는지 말해 주지 않는다 — 제목이 말해 준다.
 * GitHub·로컬 프로젝트는 저장소명·프로젝트명 하나로 줄인다.
 */
export function mentionLabel(file: PendingAttachment): string {
  if (file.group) return file.group;
  if (file.kind === 'link') return file.name;
  const parts = file.name.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? file.name;
}

/** 같은 덩어리에서 온 첨부를 묶는 열쇠 — group이 없으면 그 자체가 한 덩어리다. */
export function groupKeyOf(file: PendingAttachment): string {
  return file.group ?? file.url;
}

export interface MentionGroup {
  key: string;
  label: string;
  source?: AttachmentSource;
  kind: AttachmentKind;
  files: PendingAttachment[];
}

/** 참조 첨부를 덩어리별로 묶는다 — 붙인 순서를 지킨다. */
export function mentionGroups(files: PendingAttachment[]): MentionGroup[] {
  const groups: MentionGroup[] = [];
  const index = new Map<string, MentionGroup>();

  for (const file of files) {
    const key = groupKeyOf(file);
    const existing = index.get(key);
    if (existing) {
      existing.files.push(file);
      continue;
    }
    const group: MentionGroup = {
      key,
      label: mentionLabel(file),
      source: file.source,
      kind: file.kind,
      files: [file],
    };
    index.set(key, group);
    groups.push(group);
  }
  return groups;
}

/* ---------- 썸네일 ---------- */

const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac)$/i;
const TEXT_EXT = /\.(txt|log|csv|tsv|ini|env|gitignore)$/i;
const ARCHIVE_EXT = /\.(zip|jar|whl|docx|xlsx|pptx|odt|ods|odp|epub)$/i;

/**
 * 실제 그림을 그려 줄 수 있는 첨부인가 — 캐러셀 썸네일 전용 판별.
 *
 * 요구 범위는 png · jpg · jpeg · webp · gif · svg · mp4 · webm · mp3 · wav 다.
 * 나머지(pdf·zip·소스코드 등)는 그림이 없으므로 확장자 타일로 그린다 — 억지로
 * 빈 프레임을 띄우면 "안 불러와진 이미지"처럼 보인다.
 *
 * 오디오는 앨범 아트가 실제로 뽑혔을 때만 'audio-art'가 된다(artUrl 유무로 판단).
 */
export type ThumbKind = 'image' | 'video' | 'audio-art' | null;

const THUMB_IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;
const THUMB_VIDEO_EXT = /\.(mp4|webm)$/i;
const THUMB_AUDIO_EXT = /\.(mp3|wav)$/i;

/** 확장자가 없는 첨부(Drive 내보내기 등)를 위해 MIME으로도 한 번 본다. */
const THUMB_IMAGE_MIME = /^image\/(png|jpeg|webp|gif|svg\+xml)$/i;
const THUMB_VIDEO_MIME = /^video\/(mp4|webm)$/i;

export function thumbKindOf(file: PendingAttachment): ThumbKind {
  const name = file.name;
  const mime = file.mime ?? '';

  // 음원은 앨범 아트가 실제로 뽑혔을 때만 그림이 있다 — 없으면 확장자 타일로 내려간다
  if (THUMB_AUDIO_EXT.test(name)) return file.artUrl ? 'audio-art' : null;
  if (THUMB_IMAGE_EXT.test(name) || THUMB_IMAGE_MIME.test(mime)) return 'image';
  if (THUMB_VIDEO_EXT.test(name) || THUMB_VIDEO_MIME.test(mime)) return 'video';
  return null;
}

/* ---------- 미리보기(라이트박스) ---------- */

/** 미리보기 창에서 어떤 형태로 열 것인가 — null이면 "미리보기 불가"로 안내한다. */
export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive';

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
  // zip 계열은 목록을 펼쳐 보여 준다 — docx/xlsx도 실은 zip이라 같은 길로 간다
  if (ARCHIVE_EXT.test(name) || mime === 'application/zip') return 'archive';
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
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const gb = bytes / (1024 * 1024 * 1024);
  // 딱 떨어지는 값에 소수점을 붙이면(10.00GB) 상한 안내가 지저분해진다
  return `${Number.isInteger(gb) ? gb : gb.toFixed(2)} GB`;
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

/* ---------- 캐러셀 항목 ---------- */

/**
 * 캐러셀에 늘어놓을 것 하나.
 *
 * 낱개 파일은 그대로 카드가 되고, 가져온 출처(GitHub·프로젝트·URL)는 덩어리 하나가
 * 카드 하나가 된다 — 저장소 40개 파일이 카드 40장이 되지 않도록.
 */
export type CarouselItem =
  | { type: 'file'; key: string; file: PendingAttachment }
  | { type: 'group'; key: string; group: MentionGroup };

/** 붙인 순서를 지키면서 낱개 파일과 덩어리를 한 줄로 세운다. */
export function carouselItems(files: PendingAttachment[]): CarouselItem[] {
  const items: CarouselItem[] = [];
  const seen = new Set<string>();

  files.forEach((file, index) => {
    if (slotOf(file) === 'thumb') {
      items.push({ type: 'file', key: `${file.url}-${index}`, file });
      return;
    }
    const key = groupKeyOf(file);
    if (seen.has(key)) return;
    seen.add(key);
    // 같은 덩어리의 파일을 전부 모아 하나의 카드로 세운다
    const group = mentionGroups(files.filter((entry) => groupKeyOf(entry) === key))[0];
    items.push({ type: 'group', key, group });
  });

  return items;
}
