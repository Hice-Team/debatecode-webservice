// AI Search 원격 첨부 — GitHub 코드 가져오기 / URL 첨부.
//
// 브라우저에서 직접 가져오면 CORS에 막히고, 원본을 보관할 곳도 없다.
// 그래서 서버가 대신 받아 GitHub 코드는 스토리지에 파일로 남기고,
// 일반 URL은 링크와 본문 미리보기만 메타데이터로 돌려준다.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession } from '@/app/lib/dal';
import { createClient } from '@/app/lib/supabase/server';
import { AI_ATTACHMENT_BUCKET, attachmentProxyUrl, safeStorageKey } from '@/app/lib/storage';
import { rateLimit } from '@/app/lib/rate-limit';
import { MAX_REPO_FILES, fetchRepoFiles, parseRepoUrl } from '@/app/lib/github-import';

const MAX_BYTES = 2 * 1024 * 1024; // 원격 원문은 2MB까지만 받는다
const PREVIEW_CHARS = 1200;

const bodySchema = z.object({
  mode: z.enum(['github', 'url']),
  url: z.string().trim().min(1).max(2000),
});

/**
 * 사설망·루프백으로의 요청을 막는다(서버를 통한 내부망 탐색 방지).
 *
 * 한계: 공개 도메인이 사설 IP로 해석되는 DNS 리바인딩까지는 막지 못한다.
 * (엣지 런타임에서는 이름 해석 결과를 볼 수 없다.) 리터럴 IP와 사내 도메인,
 * 그리고 리다이렉트 각 홉을 막는 선에서 방어한다.
 */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || /\.(localhost|internal|local|home\.arpa)$/.test(host)) return true;

  // IPv6 — 루프백(::1), 유니크 로컬(fc00::/7), 링크 로컬(fe80::/10)
  if (host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return true;
  // IPv4 매핑 IPv6 (::ffff:127.0.0.1) — 내부의 v4 부분으로 다시 판단한다
  const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isBlockedHost(mapped[1]);

  // 점 없는 숫자 주소(예: 2130706433 = 127.0.0.1)는 우회 시도로 보고 막는다
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/.test(host)) return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // 링크 로컬 · 클라우드 메타데이터(169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // 캐리어 그레이드 NAT
    if (a >= 224) return true; // 멀티캐스트 · 예약
  }
  return false;
}

function parseUrl(raw: string): URL | null {
  let value = raw;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (isBlockedHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** github.com/owner/repo/blob/ref/path → raw.githubusercontent.com 원문 주소 */
function toRawGithub(url: URL): { raw: string; name: string } | null {
  const host = url.hostname.toLowerCase();
  if (host === 'raw.githubusercontent.com' || host === 'gist.githubusercontent.com') {
    return { raw: url.toString(), name: url.pathname.split('/').filter(Boolean).pop() || 'github-file' };
  }
  if (host !== 'github.com' && host !== 'www.github.com') return null;

  const parts = url.pathname.split('/').filter(Boolean);
  const marker = parts.findIndex((p) => p === 'blob' || p === 'raw');
  if (marker === -1 || parts.length < marker + 3) return null;

  const [owner, repo] = parts;
  const rest = parts.slice(marker + 1); // ref/path...
  return {
    raw: `https://raw.githubusercontent.com/${owner}/${repo}/${rest.join('/')}`,
    name: rest[rest.length - 1] || 'github-file',
  };
}

/** HTML에서 제목과 본문 텍스트를 대충 추려낸다 — 미리보기 용도라 완벽할 필요는 없다. */
function summarizeHtml(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text };
}

/**
 * 원격 문서를 받아온다 — 리다이렉트를 직접 따라간다.
 *
 * `redirect: 'follow'`로 두면 공개 주소가 사설망으로 302를 보내는 순간
 * 첫 검사(parseUrl)를 통과한 채 내부망에 접속하게 된다. 그래서 홉마다 다시 검사한다.
 */
async function fetchRemote(target: string, maxHops = 4): Promise<Response | null> {
  let current = target;

  for (let hop = 0; hop <= maxHops; hop += 1) {
    if (!parseUrl(current)) return null; // 사설망·비 http(s)로 유도된 경우

    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'debateCode-ai-search/1.0', Accept: '*/*' },
    });

    if (res.status < 300 || res.status >= 400) return res;

    const location = res.headers.get('location');
    if (!location) return res;
    current = new URL(location, current).toString();
  }
  return null; // 리다이렉트가 너무 많다
}

/**
 * 저장소 전체 가져오기 — 고른 파일들을 스토리지에 올려 첨부 배열로 돌려준다.
 *
 * 개별 파일 업로드가 하나 실패해도 나머지는 살린다. 전부 실패했을 때만 오류로 본다.
 */
async function importRepository(
  target: ReturnType<typeof parseRepoUrl> & object,
  userId: string,
): Promise<Response> {
  const result = await fetchRepoFiles(target);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 });

  const supabase = await createClient();
  const label = `${result.owner}/${result.repo}`;

  const uploaded = await Promise.all(
    result.files.map(async (file) => {
      const bytes = new TextEncoder().encode(file.text);
      const path = safeStorageKey(userId, file.path);
      const { error } = await supabase.storage
        .from(AI_ATTACHMENT_BUCKET)
        .upload(path, new Blob([bytes], { type: 'text/plain; charset=utf-8' }), {
          contentType: 'text/plain; charset=utf-8',
        });
      if (error) return null;
      return {
        kind: 'code' as const,
        source: 'github' as const,
        // 저장소 안 경로를 그대로 이름으로 쓴다 — 같은 파일명이 여러 폴더에 있어도 구분된다
        name: `${label}/${file.path}`,
        url: attachmentProxyUrl(path),
        mime: 'text/plain',
        size: bytes.byteLength,
        preview: file.text.slice(0, PREVIEW_CHARS),
      };
    }),
  );

  const files = uploaded.filter((file) => file !== null);
  if (files.length === 0) {
    return NextResponse.json({ error: '가져온 파일을 저장하지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({
    files,
    repo: label,
    ref: result.ref,
    skipped: result.skipped,
    // 상한에 걸렸는지 이용자에게 알려 준다 — 조용히 잘라 내면 왜 일부만 왔는지 알 수 없다
    limited: result.skipped > 0 || result.treeTruncated,
    limit: MAX_REPO_FILES,
  });
}

export async function POST(request: Request) {
  const { userId } = await verifySession();

  if (!rateLimit(`ai-import:${userId}`, 20, 60_000)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '주소를 확인해 주세요.' }, { status: 400 });

  const url = parseUrl(parsed.data.url);
  if (!url) return NextResponse.json({ error: '가져올 수 없는 주소입니다.' }, { status: 400 });

  /* ---------- GitHub 코드 ---------- */
  if (parsed.data.mode === 'github') {
    // 파일 주소(/blob/)가 아니면 저장소 전체로 본다.
    // 이용자는 보통 주소창의 저장소 주소를 그대로 붙여 넣지, 파일 하나를 골라 오지 않는다.
    const repo = parseRepoUrl(url);
    if (repo) return importRepository(repo, userId);

    const target = toRawGithub(url);
    if (!target) {
      return NextResponse.json(
        { error: 'GitHub 저장소나 파일 주소를 넣어 주세요. (예: github.com/owner/repo)' },
        { status: 400 },
      );
    }

    const res = await fetchRemote(target.raw).catch(() => null);
    if (!res?.ok) return NextResponse.json({ error: 'GitHub에서 파일을 가져오지 못했습니다.' }, { status: 502 });

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: '파일이 너무 큽니다. (최대 2MB)' }, { status: 413 });
    }
    const text = new TextDecoder().decode(buffer);

    // 원문을 스토리지에 남겨야 나중에 다시 열어볼 수 있다
    const supabase = await createClient();
    const path = safeStorageKey(userId, target.name);
    const { error } = await supabase.storage
      .from(AI_ATTACHMENT_BUCKET)
      .upload(path, new Blob([buffer], { type: 'text/plain; charset=utf-8' }), {
        contentType: 'text/plain; charset=utf-8',
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      kind: 'code',
      source: 'github',
      name: target.name,
      url: attachmentProxyUrl(path),
      mime: 'text/plain',
      size: buffer.byteLength,
      preview: text.slice(0, PREVIEW_CHARS),
    });
  }

  /* ---------- 일반 URL ---------- */
  const res = await fetchRemote(url.toString()).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: '해당 주소를 열지 못했습니다.' }, { status: 502 });

  const contentType = res.headers.get('content-type') ?? '';
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: '문서가 너무 큽니다. (최대 2MB)' }, { status: 413 });
  }

  let name = url.hostname + (url.pathname === '/' ? '' : url.pathname);
  let preview = '';
  if (contentType.includes('text/html')) {
    const { title, text } = summarizeHtml(new TextDecoder().decode(buffer));
    if (title) name = title;
    preview = text.slice(0, PREVIEW_CHARS);
  } else if (contentType.startsWith('text/') || contentType.includes('json')) {
    preview = new TextDecoder().decode(buffer).slice(0, PREVIEW_CHARS);
  }

  return NextResponse.json({
    kind: 'link',
    source: 'url',
    name: name.slice(0, 200),
    url: url.toString(),
    mime: contentType.split(';')[0] || undefined,
    size: buffer.byteLength,
    preview,
  });
}
