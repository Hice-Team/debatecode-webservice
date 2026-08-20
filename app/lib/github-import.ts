// GitHub 리포지토리 가져오기 — 파일 하나가 아니라 저장소 전체를 첨부로 만든다.
//
// 왜 tarball이 아니라 트리 API인가.
//   zip/tar를 받아 푸는 편이 요청 수는 적지만, 엣지 런타임에서 압축을 풀려면 해제 라이브러리를
//   번들에 넣고 수십 MB를 메모리에 올려야 한다. 어차피 붙일 파일은 코드·문서 몇십 개뿐이라
//   목록을 받아 필요한 것만 골라 받는 편이 가볍고 예측 가능하다.
//
// 요청 예산.
//   트리 조회 1회(api.github.com) + 파일 수만큼 raw 조회(raw.githubusercontent.com).
//   raw 쪽은 API 사용량에 잡히지 않으므로, 토큰 없이도 가져오기 1회당 API 호출은 1~2회다.
//   GITHUB_TOKEN이 있으면 시간당 한도가 60 → 5,000으로 올라간다(선택).

/** 한 번에 가져올 최대 파일 수 — 첨부 목록이 감당할 수 있는 선. */
export const MAX_REPO_FILES = 40;
/** 파일 하나의 상한 — 이보다 크면 소스가 아니라 데이터일 가능성이 높다. */
const MAX_FILE_BYTES = 256 * 1024;
/** 전부 합쳐 이 크기를 넘으면 거기서 멈춘다. */
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
/** 동시에 받아오는 수 — 너무 높이면 GitHub이 429로 끊는다. */
const CONCURRENCY = 6;

/** 의존성·빌드 산출물·바이너리 폴더는 통째로 건너뛴다. */
const SKIP_DIR =
  /(^|\/)(node_modules|\.git|\.next|\.turbo|\.cache|dist|build|out|coverage|vendor|venv|\.venv|__pycache__|target|Pods|DerivedData)(\/|$)/;

/** 붙일 가치가 있는 확장자만 — 이미지·폰트·바이너리는 대화에 도움이 되지 않는다. */
const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|java|c|h|cpp|cc|hpp|cs|go|rs|rb|php|swift|kt|kts|scala|sh|bash|zsh|sql|json|ya?ml|toml|xml|html?|css|scss|less|md|mdx|txt|dart|lua|r|vue|svelte|prisma|graphql|gradle|proto)$/i;
/** 확장자가 없어도 의미가 큰 파일들. */
const NOTABLE = /(^|\/)(Dockerfile|Makefile|LICENSE|README|CHANGELOG|\.env\.example)$/i;

export interface RepoTarget {
  owner: string;
  repo: string;
  /** 브랜치·태그·커밋 — 없으면 기본 브랜치를 조회한다 */
  ref?: string;
  /** 하위 폴더만 가져오는 경우 */
  path?: string;
}

/**
 * 저장소 주소를 해석한다. 파일 주소(/blob/)는 여기서 처리하지 않는다(단일 파일 경로가 맡는다).
 *
 *   github.com/owner/repo
 *   github.com/owner/repo/tree/main
 *   github.com/owner/repo/tree/main/src/lib
 */
export function parseRepoUrl(url: URL): RepoTarget | null {
  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return null;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, rawRepo, marker, ref, ...rest] = parts;
  if (marker === 'blob' || marker === 'raw') return null; // 단일 파일
  if (marker && marker !== 'tree') return null; // issues, pulls, wiki …

  const repo = rawRepo.replace(/\.git$/i, '');
  return { owner, repo, ref: marker === 'tree' ? ref : undefined, path: rest.join('/') || undefined };
}

function apiHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'debateCode-ai-search/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  // 선택 — 없으면 익명 한도(시간당 60회)로 동작한다
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** 가져올 가치가 있는 경로인가. */
function wanted(path: string): boolean {
  if (SKIP_DIR.test(path)) return false;
  if (/(^|\/)\.[^/]+$/.test(path) && !NOTABLE.test(path)) return false; // 숨김 파일
  return CODE_EXT.test(path) || NOTABLE.test(path);
}

export interface RepoFile {
  path: string;
  size: number;
  text: string;
}

export interface RepoImportResult {
  owner: string;
  repo: string;
  ref: string;
  files: RepoFile[];
  /** 조건에 맞았지만 상한 때문에 가져오지 않은 파일 수 */
  skipped: number;
  /** GitHub이 트리 자체를 잘라 보낸 경우(아주 큰 저장소) */
  treeTruncated: boolean;
}

/**
 * 저장소에서 코드·문서 파일을 골라 내용까지 받아온다.
 *
 * 실패는 예외가 아니라 문자열로 돌려준다 — 라우트가 그대로 이용자에게 보여 준다.
 */
export async function fetchRepoFiles(target: RepoTarget): Promise<RepoImportResult | { error: string }> {
  const { owner, repo } = target;
  let ref = target.ref;

  if (!ref) {
    const meta = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!meta) return { error: 'GitHub에 연결하지 못했습니다.' };
    if (meta.status === 404) return { error: '저장소를 찾지 못했습니다. 공개 저장소만 가져올 수 있습니다.' };
    if (meta.status === 403) return { error: 'GitHub 요청 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.' };
    if (!meta.ok) return { error: '저장소 정보를 읽지 못했습니다.' };
    const info = (await meta.json().catch(() => null)) as { default_branch?: string } | null;
    ref = info?.default_branch ?? 'main';
  }

  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    { headers: apiHeaders(), signal: AbortSignal.timeout(20_000) },
  ).catch(() => null);
  if (!treeRes) return { error: 'GitHub에 연결하지 못했습니다.' };
  if (treeRes.status === 404) return { error: '해당 브랜치를 찾지 못했습니다.' };
  if (treeRes.status === 403) return { error: 'GitHub 요청 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.' };
  if (!treeRes.ok) return { error: '파일 목록을 읽지 못했습니다.' };

  const tree = (await treeRes.json().catch(() => null)) as {
    tree?: Array<{ path: string; type: string; size?: number }>;
    truncated?: boolean;
  } | null;
  if (!tree?.tree) return { error: '파일 목록을 읽지 못했습니다.' };

  const prefix = target.path ? `${target.path.replace(/\/$/, '')}/` : '';
  const candidates = tree.tree.filter(
    (entry) =>
      entry.type === 'blob' &&
      (!prefix || entry.path.startsWith(prefix)) &&
      wanted(entry.path) &&
      (entry.size ?? 0) <= MAX_FILE_BYTES,
  );

  if (candidates.length === 0) {
    return { error: '가져올 만한 코드·문서 파일을 찾지 못했습니다.' };
  }

  // 얕은 경로를 먼저 — README·설정처럼 저장소를 설명하는 파일이 대개 위에 있다
  candidates.sort((a, b) => {
    const depth = a.path.split('/').length - b.path.split('/').length;
    return depth !== 0 ? depth : a.path.localeCompare(b.path);
  });

  const picked = candidates.slice(0, MAX_REPO_FILES);
  const files: RepoFile[] = [];
  let total = 0;

  // 동시에 몇 개씩 끊어 받는다
  for (let i = 0; i < picked.length; i += CONCURRENCY) {
    if (total >= MAX_TOTAL_BYTES) break;
    const batch = picked.slice(i, i + CONCURRENCY);
    const loaded = await Promise.all(
      batch.map(async (entry) => {
        const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${entry.path
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`;
        const res = await fetch(raw, {
          headers: { 'User-Agent': 'debateCode-ai-search/1.0' },
          signal: AbortSignal.timeout(20_000),
        }).catch(() => null);
        if (!res?.ok) return null;
        const text = await res.text().catch(() => null);
        if (text === null) return null;
        return { path: entry.path, size: text.length, text };
      }),
    );
    for (const file of loaded) {
      if (!file) continue;
      if (total + file.size > MAX_TOTAL_BYTES) break;
      total += file.size;
      files.push(file);
    }
  }

  if (files.length === 0) return { error: '파일 내용을 가져오지 못했습니다.' };

  return {
    owner,
    repo,
    ref,
    files,
    skipped: candidates.length - files.length,
    treeTruncated: tree.truncated === true,
  };
}
