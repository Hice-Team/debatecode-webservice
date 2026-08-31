// 첨부를 모델이 실제로 읽을 수 있는 글로 바꾼다.
//
// 예전에는 파일 이름만 프롬프트에 실었고, 프롬프트에 "파일 내용은 전달되지 않습니다"라고
// 적어 두기까지 했다. 그래서 이용자가 코드를 붙이고 "이거 왜 안 돼요?"라고 물으면 모델은
// 파일명만 보고 답했다 — 첨부가 사실상 장식이었다.
//
// 지금은 스토리지에서 원문을 읽어 프롬프트에 넣는다. 다만 무한정 넣을 수는 없다.
//   · 파일 하나당 MAX_FILE_CHARS 자
//   · 전부 합쳐 MAX_TOTAL_CHARS 자
//   · 잘렸으면 잘렸다고 프롬프트 안에 적는다(모델이 "전부 봤다"고 착각하지 않도록)
//
// 글로 바꿀 수 없는 첨부(이미지·영상·압축)는 내용 대신 "무엇이 붙어 있는지"만 알린다.
// 이 텍스트 파이프라인으로는 그림을 볼 수 없다는 사실을 모델에게 숨기지 않는다.
import { createClient } from '@/app/lib/supabase/server';
import { AI_ATTACHMENT_BUCKET, attachmentPathFromUrl } from '@/app/lib/storage';

export interface ContextAttachment {
  kind: 'image' | 'file' | 'link' | 'code';
  name: string;
  url: string;
  mime?: string;
  size?: number;
  source?: string;
  preview?: string;
}

/** 파일 하나에서 읽을 최대 글자 수 — 이 이상은 맥락을 흐리고 한도만 먹는다. */
const MAX_FILE_CHARS = 24_000;
/** 첨부 전체가 차지할 최대 글자 수. */
const MAX_TOTAL_CHARS = 120_000;
/** 스토리지에서 내려받을 최대 바이트 — 10GB짜리를 읽으려 들면 안 된다. */
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
/**
 * 모델에 실어 보낼 그림 하나의 최대 바이트.
 *
 * base64로 감싸면 4/3배로 불어난다. 4MB짜리 사진 두 장이면 프롬프트가 11MB가 되고,
 * 대부분의 공급자가 요청 크기에서 먼저 막는다.
 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** 한 질문에 함께 보낼 그림 수 — 많이 넣을수록 토큰이 급격히 는다. */
const MAX_IMAGES = 4;

const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|java|c|h|cpp|cc|hpp|cs|go|rs|rb|php|swift|kt|kts|scala|sh|bash|zsh|sql|json|ya?ml|toml|xml|html?|css|scss|less|md|dart|lua|r|vue|svelte|txt|log|csv|tsv|ini|env|gitignore)$/i;

/** 글자로 읽어도 되는 첨부인가 — 바이너리를 디코딩하면 깨진 글자만 잔뜩 나온다. */
function isTextual(file: ContextAttachment): boolean {
  const mime = file.mime ?? '';
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) return false;
  if (mime === 'application/pdf' || mime === 'application/zip') return false;
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) return true;
  return TEXT_EXT.test(file.name);
}

/** 코드 블록 언어 태그 — 모델이 무슨 언어인지 알면 답이 정확해진다. */
function fenceLanguage(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
    py: 'python', java: 'java', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
    cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', swift: 'swift',
    kt: 'kotlin', kts: 'kotlin', scala: 'scala', sh: 'bash', bash: 'bash', zsh: 'bash',
    sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', md: 'markdown',
    dart: 'dart', lua: 'lua', vue: 'vue', svelte: 'svelte', csv: 'csv',
  };
  return map[ext] ?? '';
}

/** 널 바이트가 섞여 있으면 바이너리다 — 통째로 프롬프트에 넣지 않는다. */
function looksBinary(text: string): boolean {
  return text.slice(0, 2000).includes('\u0000');
}

/**
 * 스토리지에서 첨부 원문을 읽는다. 우리 버킷이 아니거나 실패하면 null.
 *
 * 권한은 두 겹이다. 여기서 키 앞자리(userId)를 세션과 대조하고, 버킷 RLS가 같은 조건을
 * 한 번 더 본다 — 요청 본문에 남의 첨부 주소를 적어 보내도 내용이 새지 않는다.
 */
async function downloadText(url: string, userId: string): Promise<string | null> {
  const path = attachmentPathFromUrl(url);
  if (!path || path.includes('..') || !path.startsWith(`${userId}/`)) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(AI_ATTACHMENT_BUCKET).download(path);
    if (error || !data) return null;
    if (data.size > MAX_DOWNLOAD_BYTES) {
      const head = await data.slice(0, MAX_DOWNLOAD_BYTES).text();
      return looksBinary(head) ? null : head;
    }
    const text = await data.text();
    return looksBinary(text) ? null : text;
  } catch {
    return null;
  }
}

/** 모델이 실제로 받아들이는 그림 형식인지 — 그 밖의 형식은 보내 봐야 거절된다. */
const VISION_MIME = /^image\/(png|jpeg|webp|gif)$/i;
const VISION_EXT = /\.(png|jpe?g|webp|gif)$/i;

function isVisionImage(file: ContextAttachment): boolean {
  const mime = file.mime ?? '';
  if (mime) return VISION_MIME.test(mime);
  return VISION_EXT.test(file.name);
}

/**
 * 그림을 data: URL로 만든다.
 *
 * 스토리지 주소를 그대로 넘길 수 없다. 그 주소는 우리 세션 쿠키가 있어야 열리는데
 * 모델 공급자에게는 그 쿠키가 없다 — 넘겨 봐야 "이미지를 불러올 수 없다"만 돌아온다.
 */
async function downloadImage(url: string, userId: string): Promise<string | null> {
  const path = attachmentPathFromUrl(url);
  if (!path || path.includes('..') || !path.startsWith(`${userId}/`)) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(AI_ATTACHMENT_BUCKET).download(path);
    if (error || !data || data.size === 0 || data.size > MAX_IMAGE_BYTES) return null;

    const bytes = new Uint8Array(await data.arrayBuffer());
    // btoa는 8KB 넘는 문자열에서 스택을 넘길 수 있어 조각내 잇는다
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const mime = data.type && VISION_MIME.test(data.type) ? data.type : 'image/png';
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/** 사람이 읽는 용량 표기 — 프롬프트 머리글에 쓴다. */
function shortBytes(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

export interface AttachmentContext {
  /** 프롬프트에 그대로 붙일 블록. 첨부가 없으면 빈 문자열. */
  text: string;
  /** 내용까지 읽어 넣은 첨부 수 */
  read: number;
  /** 이름만 알린 첨부 수(압축·미디어 등) */
  listed: number;
  /** 모델에 실어 보낼 그림 — data: URL. 그림을 볼 수 있는 모델일 때만 채워진다. */
  images: string[];
}

/**
 * 첨부 목록을 프롬프트 블록 하나로 만든다.
 *
 * 원문을 읽어 오는 일이 첨부 수만큼 있으므로 병렬로 받되, 프롬프트에 넣는 순서는
 * 이용자가 붙인 순서를 지킨다 — 모델이 "첫 번째 파일"이라고 부를 때 서로 다른 것을
 * 가리키면 안 된다.
 */
export async function buildAttachmentContext(
  files: ContextAttachment[],
  userId: string,
  /** 고른 모델이 그림을 볼 수 있는가 — 못 보면 그림을 싣지 않고 그 사실을 프롬프트에 적는다 */
  canSeeImages = false,
): Promise<AttachmentContext> {
  if (files.length === 0) return { text: '', read: 0, listed: 0, images: [] };

  // 그림은 볼 수 있는 모델일 때만 내려받는다 — 못 볼 모델에 4MB를 읽어 봐야 버릴 뿐이다
  const pictures = canSeeImages ? files.filter(isVisionImage).slice(0, MAX_IMAGES) : [];
  const encoded = await Promise.all(pictures.map((file) => downloadImage(file.url, userId)));
  const images = encoded.filter((url): url is string => url !== null);
  const sent = new Set(pictures.filter((_, i) => encoded[i] !== null));

  const bodies = await Promise.all(
    files.map(async (file) => {
      // GitHub·URL 첨부는 가져올 때 이미 발췌를 받아 뒀다 — 다시 내려받지 않는다
      if (file.kind === 'link') return file.preview ?? null;
      if (!isTextual(file)) return null;
      return (await downloadText(file.url, userId)) ?? file.preview ?? null;
    }),
  );

  const blocks: string[] = [];
  let budget = MAX_TOTAL_CHARS;
  let read = 0;
  let listed = 0;

  files.forEach((file, index) => {
    const meta = [file.source, shortBytes(file.size)].filter(Boolean).join(' · ');
    const heading = `### 첨부 ${index + 1}: ${file.name}${meta ? ` (${meta})` : ''}`;
    const body = bodies[index];

    if (!body || budget <= 0) {
      listed += 1;
      const why = sent.has(file)
        ? '이미지입니다. 이 질문과 함께 그림을 그대로 보냈으니 직접 보고 답하세요.'
        : file.kind === 'image'
          ? canSeeImages
            ? '이미지입니다. 크기나 형식 때문에 싣지 못했습니다 — 필요한 내용은 이용자에게 글로 물어보세요.'
            : '이미지입니다. 지금 고른 모델은 그림을 볼 수 없습니다. 그림을 보고 답해야 하는 질문이면, 이미지를 이해하는 모델로 바꾸라고 알려 주세요.'
          : budget <= 0
            ? '분량 상한에 걸려 내용을 싣지 못했습니다.'
            : '글로 읽을 수 없는 형식입니다(바이너리·압축·미디어). 이름과 형식만 참고하세요.';
      blocks.push(`${heading}\n(${why})`);
      return;
    }

    const allowed = Math.min(MAX_FILE_CHARS, budget);
    const clipped = body.length > allowed;
    const text = body.slice(0, allowed);
    budget -= text.length;
    read += 1;

    const fence = file.kind === 'link' ? '' : fenceLanguage(file.name);
    blocks.push(
      [
        heading,
        file.kind === 'link' ? `원본 주소: ${file.url}` : '',
        '```' + fence,
        text,
        '```',
        clipped ? `(앞 ${text.length.toLocaleString()}자만 실었습니다. 뒷부분은 보이지 않습니다.)` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  });

  const header =
    `[첨부된 파일 ${files.length}개]\n` +
    '아래 내용은 이용자가 이번 질문에 붙인 것입니다. 답변할 때 실제 내용을 근거로 삼으세요. ' +
    '내용이 잘렸다고 표시된 파일은 그 범위 안에서만 판단하고, 모자라면 어느 부분이 더 필요한지 물어보세요.';

  return { text: `${header}\n\n${blocks.join('\n\n')}`, read, listed, images };
}
