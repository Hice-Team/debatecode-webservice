import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/page-shell";
import I18nSlot from "@/app/components/i18n-slot";
import { prisma } from "@/app/lib/prisma";
import {
  ALL_BOARD,
  BOARDS,
  BOARD_GROUPS,
  SNS_PLATFORMS,
  boardLabel,
  boardDesc,
  boardsInGroup,
  isBoardKey,
  platformColor,
  platformLabel,
} from "./boards";
import Pagination from "@/app/components/pagination";
import { seasonAt } from "@/app/lib/season";
import { getSessionOptional } from "@/app/lib/dal";
import { visiblePostsWhere } from "@/app/lib/board-rules";
import { displayName } from "@/app/lib/display-name";

export const metadata: Metadata = { title: "커뮤니티" };

const PAGE_SIZE = 20;
// 탭 줄에 바로 노출할 게시판 수 — 나머지는 "더보기"로 접는다
const VISIBLE_TABS = 4;
const FRESH_MS = 24 * 60 * 60 * 1000;

// 정렬 — 최신순만 겉으로 드러내고 나머지는 드롭다운 안에 둔다
const SORTS = [
  { key: "latest", label: "최신순" },
  { key: "likes", label: "좋아요순" },
  { key: "comments", label: "댓글순" },
  { key: "views", label: "조회순" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

interface PostRowData {
  id: string;
  board: string;
  type: string;
  title: string;
  snsPlatform: string | null;
  viewCount: number;
  createdAt: Date;
  anonymous: boolean;
  secret: boolean;
  adoptedCommentId: string | null;
  author: { name: string; anonymousTag: string | null };
  _count: { comments: number; likes: number };
}

function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && SORTS.some((s) => s.key === value);
}

function orderByFor(sort: SortKey) {
  if (sort === "likes")
    return [
      { likes: { _count: "desc" as const } },
      { createdAt: "desc" as const },
    ];
  if (sort === "comments")
    return [
      { comments: { _count: "desc" as const } },
      { createdAt: "desc" as const },
    ];
  if (sort === "views")
    return [{ viewCount: "desc" as const }, { createdAt: "desc" as const }];
  return [{ createdAt: "desc" as const }];
}

/** 새 글 배지의 기준 시각 — 이 시점 이후에 올라온 글만 "새 글"로 센다 */
function freshCutoff(): Date {
  return new Date(Date.now() - FRESH_MS);
}

/** 오늘 안의 글은 "2시간 전"이, 지난 글은 날짜가 읽기 쉽다 */
function timeLabel(date: Date): string {
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return date
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\.$/, "");
}

export default async function CommunityPage({
  searchParams,
}: PageProps<"/community">) {
  const { board, platform, q, page, sort } = await searchParams;
  const boardParam = typeof board === "string" ? board : undefined;
  const activeBoard =
    boardParam === ALL_BOARD
      ? ALL_BOARD
      : isBoardKey(boardParam)
        ? boardParam
        : ALL_BOARD;
  const activePlatform = typeof platform === "string" ? platform : undefined;
  const query = typeof q === "string" ? q.trim() : "";
  const pageNum = Math.max(
    1,
    Number(typeof page === "string" ? page : "1") || 1,
  );
  const activeSort: SortKey = isSortKey(sort) ? sort : "latest";

  // 열람 권한 — 비밀글은 작성자 본인과 관리자/디베이트메이트에게만 보인다
  const session = await getSessionOptional();
  const viewer = session
    ? {
        userId: session.userId,
        role:
          (
            await prisma.user.findUnique({
              where: { id: session.userId },
              select: { role: true },
            })
          )?.role ?? "user",
      }
    : { userId: null, role: "user" };

  const visible = visiblePostsWhere(viewer);
  const where = {
    ...visible,
    ...(activeBoard === ALL_BOARD ? {} : { board: activeBoard }),
    ...(activeBoard === "sns" && activePlatform
      ? { snsPlatform: activePlatform }
      : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { content: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const postSelect = {
    id: true,
    board: true,
    type: true,
    title: true,
    snsPlatform: true,
    viewCount: true,
    createdAt: true,
    anonymous: true,
    secret: true,
    adoptedCommentId: true,
    author: { select: { name: true, anonymousTag: true } },
    _count: { select: { comments: true, likes: true } },
  } as const;

  const season = seasonAt();
  const weekAgo = new Date(new Date().getTime() - 7 * 24 * 3600 * 1000);
  const [posts, totalCount, freshCounts, trending] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: orderByFor(activeSort),
      select: postSelect,
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.post.count({ where }),
    // 새 글 배지 — 게시판마다 늘 숫자를 달지 않고, 최근 24시간에 새 글이 있을 때만 표시한다
    prisma.post.groupBy({
      by: ["board"],
      where: { ...visible, createdAt: { gte: freshCutoff() } },
      _count: { _all: true },
    }),
    // 이번 주 많이 읽힌 글 — 우측 레일. 목록을 훑지 않아도 볼 만한 글에 닿게 한다.
    prisma.post.findMany({
      where: { ...visible, createdAt: { gte: weekAgo } },
      orderBy: [{ viewCount: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        title: true,
        board: true,
        viewCount: true,
        _count: { select: { comments: true } },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const freshByBoard = new Map(
    freshCounts.map((row) => [row.board, row._count._all]),
  );
  const freshTotal = freshCounts.reduce((sum, row) => sum + row._count._all, 0);

  function buildHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      board: activeBoard,
      platform: activePlatform,
      q: query || undefined,
      sort: activeSort === "latest" ? undefined : activeSort,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === "board" && value === ALL_BOARD))
        params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/community?${qs}` : "/community";
  }

  const hrefFor = (p: number) =>
    buildHref({ page: p === 1 ? undefined : String(p) });

  const listTitle =
    activeBoard === ALL_BOARD ? "전체 게시글" : boardLabel(activeBoard);
  const listDesc = boardDesc(activeBoard);
  const writeHref = `/community/write?board=${activeBoard === ALL_BOARD ? "free" : activeBoard}`;

  return (
    <PageShell width="6xl">
      {/* ---------- 헤더 ---------- */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">
            COMMUNITY
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">
            <I18nSlot k="community" fallback="커뮤니티" />
          </h1>
        </div>
        <Link
          href={writeHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-signal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98]"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 fill-none stroke-current stroke-[2.2]"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <I18nSlot k="new-post-short" fallback="새 글" />
        </Link>
      </header>

      {/* ---------- 3단 레이아웃 ----------
           예전에는 게시판이 상단 탭 4개 + "더보기"에 접혀 있었다. 게시판이 여섯 개인데
           절반이 숨어 있으니 새로 온 사람은 무엇이 있는지조차 몰랐다.
           좌측 레일로 옮겨 전부 항상 보이게 하고, 우측에는 목록을 훑지 않아도 닿을
           만한 것(명예의 전당·이번 주 인기글)을 둔다. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_15rem]">
        {/* ===== 좌: 게시판 ===== */}
        <nav aria-label="게시판" className="lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-0.5">
            <BoardLink
              href={buildHref({ board: ALL_BOARD, platform: undefined, page: undefined, q: undefined })}
              label="전체"
              fresh={freshTotal}
              active={activeBoard === ALL_BOARD}
            />
          </div>
          {BOARD_GROUPS.map((group) => (
            <div key={group.key} className="mt-4">
              <p className="px-3 pb-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-soft/30">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {boardsInGroup(group.key).map((b) => (
                  <BoardLink
                    key={b.key}
                    href={buildHref({ board: b.key, platform: undefined, page: undefined, q: undefined })}
                    label={b.label}
                    fresh={freshByBoard.get(b.key) ?? 0}
                    active={b.key === activeBoard}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* 모바일에서는 우측 레일이 사라지므로 명예의 전당을 여기에 붙인다 */}
          <Link
            href="/hall-of-fame"
            className="mt-4 flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40 xl:hidden"
          >
            <span aria-hidden>🏆</span>
            <span className="min-w-0 flex-1 truncate font-medium text-ink-soft/75">
              <I18nSlot k="hof-inline" fallback="이번 시즌 명예의 전당" />
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-soft/35">
              S{season.index}
            </span>
          </Link>
        </nav>

        {/* ===== 중앙: 목록 ===== */}
        <div className="min-w-0">
          <section>
            {/* 게시판 이름과 설명 — 좌측에서 고른 곳이 어디인지 본문에서 다시 확인된다 */}
            <div className="mb-3">
              <h2 className="font-display text-lg font-bold tracking-tight text-ink">
                {listTitle}
                <span className="ml-1.5 font-mono text-xs font-normal text-ink-soft/35">
                  {totalCount}
                </span>
              </h2>
              {listDesc && (
                <p className="mt-0.5 text-[13px] text-ink-soft/50">
                  {listDesc}
                </p>
              )}
            </div>

            {/* SNS 게시판에서만 나오는 플랫폼 필터 */}
            {activeBoard === "sns" && (
              <div className="mb-3 flex flex-wrap gap-1">
                <Link
                  href={buildHref({
                    board: "sns",
                    platform: undefined,
                    page: undefined,
                  })}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                    !activePlatform
                      ? "bg-brand-50 font-semibold text-signal"
                      : "text-ink-soft/50 hover:text-ink"
                  }`}
                >
                  <I18nSlot k="all-platforms" fallback="전체 플랫폼" />
                </Link>
                {SNS_PLATFORMS.map((pf) => (
                  <Link
                    key={pf.key}
                    href={buildHref({
                      board: "sns",
                      platform: pf.key,
                      page: undefined,
                    })}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      activePlatform === pf.key
                        ? "bg-brand-50 font-semibold text-signal"
                        : "text-ink-soft/50 hover:text-ink"
                    }`}
                  >
                    {pf.label}
                  </Link>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* 검색과 정렬은 한 줄에 — 목록을 거르는 도구는 한 자리에 모은다 */}
              <form method="get" className="relative ml-auto w-full sm:w-64">
                {activeBoard !== ALL_BOARD && (
                  <input type="hidden" name="board" value={activeBoard} />
                )}
                {activePlatform && (
                  <input type="hidden" name="platform" value={activePlatform} />
                )}
                {activeSort !== "latest" && (
                  <input type="hidden" name="sort" value={activeSort} />
                )}
                <svg
                  viewBox="0 0 24 24"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-ink-soft/35 stroke-2"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.2-3.2" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  aria-label="게시글 검색"
                  placeholder="게시글 검색"
                  className="w-full rounded-lg border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-ink-soft/35 focus:border-signal/40 focus:outline-none focus:ring-2 focus:ring-signal/20"
                />
              </form>

              {/* 정렬 드롭다운 */}
              <details className="relative shrink-0">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink-soft/70 transition-colors marker:content-none hover:border-ink/25">
                  {SORTS.find((s) => s.key === activeSort)!.label}
                  <span aria-hidden className="text-ink-soft/35">
                    ▾
                  </span>
                </summary>
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-ink/10 bg-white py-1 shadow-lg shadow-ink/5">
                  {SORTS.map((s) => (
                    <Link
                      key={s.key}
                      href={buildHref({
                        sort: s.key === "latest" ? undefined : s.key,
                        page: undefined,
                      })}
                      className={`block px-3 py-2 text-sm transition-colors hover:bg-brand-50/60 ${
                        s.key === activeSort
                          ? "font-semibold text-signal"
                          : "text-ink-soft/70"
                      }`}
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              </details>
            </div>

            {/* ---------- 목록 ----------
             카드가 아니라 줄이다. 제목이 가장 크고 나머지는 그 아래·옆으로 물러난다. */}
            {posts.length > 0 ? (
              <ul className="mt-3 border-t border-ink/10">
                {posts.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    showBoard={activeBoard === ALL_BOARD}
                  />
                ))}
              </ul>
            ) : (
              <div className="mt-3 border-t border-ink/10 py-20 text-center">
                <p className="text-sm text-ink-soft/45">
                  {query ? (
                    <I18nSlot
                      k="no-posts-found"
                      fallback={`"${query}"에 해당하는 글이 없습니다.`}
                    />
                  ) : (
                    <I18nSlot
                      k="no-posts-yet"
                      fallback="아직 게시글이 없습니다. 첫 글을 작성해 보세요."
                    />
                  )}
                </p>
                <Link
                  href={writeHref}
                  className="mt-4 inline-block rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
                >
                  <I18nSlot k="new-post-short" fallback="새 글" />
                </Link>
              </div>
            )}

            <Pagination
              page={pageNum}
              totalPages={totalPages}
              totalCount={totalCount}
              hrefFor={hrefFor}
            />
          </section>
        </div>

        {/* ===== 우: 사이드 레일 ===== */}
        <aside className="hidden xl:block xl:sticky xl:top-6 xl:self-start">
          <Link
            href="/hall-of-fame"
            className="group flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-3.5 py-3 text-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span aria-hidden>🏆</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink-soft/80 group-hover:text-signal">
                <I18nSlot k="hof-inline" fallback="이번 시즌 명예의 전당" />
              </span>
              <span className="font-mono text-[10px] text-ink-soft/35">
                시즌 {season.index}
              </span>
            </span>
            <span
              aria-hidden
              className="text-ink-soft/30 transition-transform group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>

          {/* 이번 주 인기글 — 목록을 훑지 않아도 볼 만한 글에 닿게 한다 */}
          {trending.length > 0 && (
            <section className="mt-4 overflow-hidden rounded-xl border border-ink/10 bg-white">
              <h2 className="border-b border-ink/[0.07] px-3.5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-soft/40">
                이번 주 많이 읽은 글
              </h2>
              <ol className="divide-y divide-ink/5">
                {trending.map((t, i) => (
                  <li key={t.id}>
                    <Link
                      href={`/community/${t.id}`}
                      className="group flex items-start gap-2 px-3.5 py-2.5 transition-colors hover:bg-brand-50/40"
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-[11px] font-bold text-ink-soft/25">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-xs leading-relaxed text-ink-soft/80 group-hover:text-signal">
                          {t.title}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] text-ink-soft/35">
                          {boardLabel(t.board)} · 조회 {t.viewCount}
                          {t._count.comments > 0 &&
                            ` · 답글 ${t._count.comments}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* 글쓰기 안내 — 어느 게시판에 무엇을 쓰는지 */}
          <section className="mt-4 rounded-xl border border-ink/10 bg-paper/50 px-3.5 py-3">
            <h2 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-soft/40">
              어디에 쓸까요
            </h2>
            <dl className="mt-2 space-y-2">
              {BOARDS.slice(0, 4).map((b) => (
                <div key={b.key}>
                  <dt className="text-[11px] font-semibold text-ink-soft/70">
                    {b.label}
                  </dt>
                  <dd className="text-[11px] leading-relaxed text-ink-soft/45">
                    {b.desc}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}

/**
 * 좌측 게시판 네비 한 줄 — 전체/그룹별 게시판이 같은 모양을 쓴다.
 * (렌더 중에 컴포넌트를 새로 만들면 매 렌더마다 다른 타입이 되어 상태가 날아간다 — 모듈 스코프에 둔다.)
 */
function BoardLink({
  href,
  label,
  fresh,
  active,
}: {
  href: string;
  label: string;
  fresh: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? 'bg-signal font-semibold text-white' : 'text-ink-soft/70 hover:bg-brand-50/60 hover:text-signal'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {fresh > 0 && (
        <span
          className={`shrink-0 rounded-full px-1.5 font-mono text-[10px] font-bold ${
            active ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700'
          }`}
          title="최근 24시간 새 글"
        >
          {fresh > 99 ? '99+' : fresh}
        </span>
      )}
    </Link>
  );
}

/**
 * 목록 한 줄 — 제목 / 작성자 · 시각 / 반응 수.
 * 공지는 연한 크림 배경과 배지로만 구분하고 구조는 같게 둔다.
 */
function PostRow({
  post,
  showBoard,
}: {
  post: PostRowData;
  showBoard: boolean;
}) {
  const notice = post.board === "notice";
  return (
    <li
      className={`border-b border-ink/[0.07] ${notice ? "bg-amber-50/60" : ""}`}
    >
      <Link
        href={`/community/${post.id}`}
        className={`group flex items-center gap-4 px-3 py-3.5 transition-colors ${
          notice ? "hover:bg-amber-50" : "hover:bg-brand-50/40"
        }`}
      >
        <div className="min-w-0 flex-1">
          {/* 제목 줄 — 길어져도 배지가 밀려나지 않게 제목만 줄인다 */}
          <div className="flex items-center gap-1.5">
            {notice && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-800">
                <I18nSlot k="pinned-notice" fallback="공지" />
              </span>
            )}
            {!notice && showBoard && (
              <span className="shrink-0 font-mono text-[11px] text-ink-soft/35">
                {boardLabel(post.board)}
              </span>
            )}
            {post.type === "link" && (
              <span
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${platformColor(post.snsPlatform)}`}
              >
                {platformLabel(post.snsPlatform)}
              </span>
            )}
            {post.secret && (
              <span
                className="shrink-0 text-[11px]"
                title="비밀글"
                aria-label="비밀글"
              >
                🔒
              </span>
            )}
            {post.adoptedCommentId && (
              <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                <I18nSlot k="answer-adopted" fallback="채택완료" />
              </span>
            )}
            <span className="truncate text-[15px] font-semibold text-ink group-hover:text-signal">
              {post.title}
            </span>
            {post._count.comments > 0 && (
              <span className="shrink-0 font-mono text-xs font-semibold text-signal">
                [{post._count.comments}]
              </span>
            )}
          </div>

          {/* 작성자 · 시각 */}
          <p className="mt-1 truncate font-mono text-[11px] text-ink-soft/40">
            <span data-no-translate>
              {displayName(post.author, post.anonymous)}
            </span>
            {" · "}
            <span title={post.createdAt.toLocaleString("ko-KR")}>
              {timeLabel(post.createdAt)}
            </span>
          </p>
        </div>

        {/* 반응 — 좋아요·조회 */}
        <div className="hidden shrink-0 items-center gap-3 font-mono text-[11px] text-ink-soft/40 sm:flex">
          <span
            className={`inline-flex items-center gap-1 ${post._count.likes > 0 ? "text-rose-500/70" : ""}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]"
              aria-hidden
            >
              <path
                d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7 2.7C19 15.6 12 20 12 20Z"
                strokeLinejoin="round"
              />
            </svg>
            {post._count.likes}
          </span>
          <span className="inline-flex items-center gap-1">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]"
              aria-hidden
            >
              <path
                d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
            {post.viewCount}
          </span>
        </div>
      </Link>
    </li>
  );
}
