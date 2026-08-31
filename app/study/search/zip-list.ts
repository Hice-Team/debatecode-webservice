// zip 안에 무엇이 들어 있는지 목록으로 읽는다 — 라이트박스에서 zip을 눌렀을 때 쓴다.
//
// 압축을 풀지 않는다. 파일 끝의 중앙 디렉터리(central directory)만 읽으면 이름·크기·
// 압축 후 크기를 전부 알 수 있고, 그러면 100MB짜리 zip도 뒤쪽 64KB만 받아 목록을 그린다.
// (라이브러리를 넣지 않은 이유 — 필요한 건 목록뿐이고 해동기는 통째로 무겁다.)

export interface ZipEntry {
  path: string;
  /** 압축 전 크기 */
  size: number;
  directory: boolean;
  /** 압축 방식 — 0 저장, 8 deflate. 그 외는 이 파일에서 풀지 못한다. */
  method: number;
  /** 압축된 바이트 크기 */
  compressedSize: number;
  /** 로컬 헤더 위치 — 실제 바이트를 읽을 때 여기서 시작한다 */
  offset: number;
}

export interface ZipListing {
  entries: ZipEntry[];
  /** 중앙 디렉터리가 잘려 실제 개수보다 적게 읽었는가 */
  truncated: boolean;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
/** 끝에서 이만큼만 훑는다 — EOCD는 주석 포함 최대 64KB + 22바이트 안에 있다. */
const EOCD_SCAN_BYTES = 66 * 1024;

function decodeName(bytes: Uint8Array, utf8Flag: boolean): string {
  // 플래그가 없어도 대부분 UTF-8이다. 깨지면 CP437 근사치(라틴1)로 물러난다.
  try {
    return new TextDecoder('utf-8', { fatal: !utf8Flag }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** EOCD를 뒤에서부터 찾는다 — 없으면 zip이 아니거나 잘린 파일이다. */
function findEocd(view: DataView): number | null {
  for (let p = view.byteLength - 22; p >= 0; p -= 1) {
    if (view.getUint32(p, true) === EOCD_SIGNATURE) return p;
  }
  return null;
}

/**
 * zip의 마지막 조각(Blob)에서 항목 목록을 읽는다.
 *
 * `tailOnly`가 true면 중앙 디렉터리가 받아온 범위 밖에서 시작할 수 있다.
 * 그때는 읽어낸 만큼만 돌려주고 truncated를 세운다 — 조용히 일부만 보여 주지 않는다.
 */
export async function listZip(blob: Blob): Promise<ZipListing | null> {
  const tailSize = Math.min(blob.size, EOCD_SCAN_BYTES);
  const tail = new Uint8Array(await blob.slice(blob.size - tailSize).arrayBuffer());
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

  const eocd = findEocd(tailView);
  if (eocd === null) return null;

  const total = tailView.getUint16(eocd + 10, true);
  const centralSize = tailView.getUint32(eocd + 12, true);
  const centralOffset = tailView.getUint32(eocd + 16, true);

  // 중앙 디렉터리 전체를 다시 받는다(끝 조각 안에 이미 있으면 그대로 쓴다)
  const tailStart = blob.size - tailSize;
  let central: Uint8Array;
  let truncated = false;
  if (centralOffset >= tailStart) {
    central = tail.subarray(centralOffset - tailStart);
  } else if (centralSize > 0 && centralSize < 32 * 1024 * 1024) {
    central = new Uint8Array(await blob.slice(centralOffset, centralOffset + centralSize).arrayBuffer());
  } else {
    central = tail;
    truncated = true;
  }

  const view = new DataView(central.buffer, central.byteOffset, central.byteLength);
  const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= central.byteLength && view.getUint32(p, true) === CENTRAL_SIGNATURE) {
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const offset = view.getUint32(p + 42, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    if (p + 46 + nameLength > central.byteLength) {
      truncated = true;
      break;
    }
    const path = decodeName(central.subarray(p + 46, p + 46 + nameLength), (flags & 0x800) !== 0);
    entries.push({ path, size, directory: path.endsWith('/'), method, compressedSize, offset });
    p += 46 + nameLength + extraLength + commentLength;
  }

  return { entries, truncated: truncated || entries.length < total };
}

/* ---------- 항목 하나 꺼내기 ---------- */

const LOCAL_SIGNATURE = 0x04034b50;
/** 한 항목에서 꺼내 볼 최대 크기 — 문서 본문을 읽는 용도라 이 이상은 필요 없다. */
export const ZIP_ENTRY_LIMIT = 8 * 1024 * 1024;

/**
 * zip 안의 파일 하나를 실제로 풀어서 바이트로 돌려준다.
 *
 * 브라우저 기본 `DecompressionStream('deflate-raw')`을 쓴다 — 해동 라이브러리를
 * 번들에 넣지 않고도 deflate(방식 8)와 무압축(방식 0)을 다룰 수 있다.
 * 그 밖의 압축 방식(bzip2·lzma 등)이나 암호화된 항목은 null이다.
 */
export async function readZipEntry(blob: Blob, entry: ZipEntry): Promise<Uint8Array | null> {
  if (entry.directory || entry.size > ZIP_ENTRY_LIMIT) return null;
  if (entry.method !== 0 && entry.method !== 8) return null;

  // 로컬 헤더는 이름·extra 길이가 중앙 디렉터리와 다를 수 있어 직접 읽어야 한다
  const header = new Uint8Array(await blob.slice(entry.offset, entry.offset + 30).arrayBuffer());
  if (header.byteLength < 30) return null;
  const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (headerView.getUint32(0, true) !== LOCAL_SIGNATURE) return null;

  const start =
    entry.offset + 30 + headerView.getUint16(26, true) + headerView.getUint16(28, true);
  const raw = blob.slice(start, start + (entry.compressedSize || entry.size));

  if (entry.method === 0) return new Uint8Array(await raw.arrayBuffer());
  if (typeof DecompressionStream === 'undefined') return null;

  try {
    const stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/* ---------- Office 문서 본문 ---------- */

/** docx·pptx·xlsx에서 본문이 들어 있는 부품의 이름. */
const OFFICE_PARTS: RegExp[] = [
  /^word\/document\.xml$/,
  /^ppt\/slides\/slide\d+\.xml$/,
  /^xl\/sharedStrings\.xml$/,
];

/** OOXML 조각에서 사람이 읽는 글자만 남긴다 — 서식 태그는 버린다. */
function textFromOoxml(xml: string): string {
  return xml
    // 문단·표 셀·공유 문자열의 끝을 줄바꿈으로 바꾼 뒤 나머지 태그를 통째로 지운다
    .replace(/<\/(w:p|a:p|si|w:tr)>/g, '\n')
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    // &amp;는 마지막에 — 먼저 풀면 &amp;lt; 같은 이중 이스케이프가 잘못 열린다
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * docx·pptx·xlsx의 본문 텍스트를 뽑는다. Office 문서가 아니거나 풀지 못하면 null.
 * (완전한 렌더링이 아니라 "무슨 내용인지 읽을 수 있는" 수준을 목표로 한다.)
 */
export async function readOfficeText(blob: Blob, listing: ZipListing): Promise<string | null> {
  const parts = listing.entries
    .filter((entry) => OFFICE_PARTS.some((pattern) => pattern.test(entry.path)))
    // slide2가 slide10보다 앞에 오도록 숫자로 정렬한다
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  if (parts.length === 0) return null;

  const chunks: string[] = [];
  for (const entry of parts.slice(0, 60)) {
    const bytes = await readZipEntry(blob, entry);
    if (!bytes) continue;
    const text = textFromOoxml(new TextDecoder().decode(bytes));
    if (text) chunks.push(text);
  }
  return chunks.length > 0 ? chunks.join('\n\n') : null;
}
