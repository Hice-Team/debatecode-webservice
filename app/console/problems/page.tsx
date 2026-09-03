import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import UploadForm from './upload-form';
import BulkImport from './bulk-import';
import { PageHeader, LinkTabs, StatGrid, Callout, EmptyRow } from '../ui';

export const metadata: Metadata = { title: '문제 관리' };

const BANK_LIMIT = 200;

/** starterCodes(Json)에서 실제로 시작 코드가 들어 있는 언어만 추린다. */
function languagesOf(starterCodes: unknown): string[] {
  const codes = (starterCodes ?? {}) as Record<string, unknown>;
  return (['javascript', 'python'] as const).filter((l) => String(codes[l] ?? '').trim().length > 0);
}

const LANG_SHORT: Record<string, string> = { javascript: 'JS', python: 'PY' };

/**
 * 문제 한 줄.
 *
 * 무엇을 손봐야 하는지가 한눈에 들어와야 한다 — 케이스가 없으면 붉게, 언어가 빠졌으면
 * 그 언어 칸을 비워 보여 준다. 예전에는 케이스 수만 있고 언어는 열어 봐야 알 수 있었다.
 */
function ProblemRow({
  problem,
  showSubmissions = false,
}: {
  problem: {
    id: number;
    title: string;
    category: string;
    difficulty: number;
    company?: string | null;
    starterCodes?: unknown;
    _count: { testCases: number; submissions?: number };
  };
  showSubmissions?: boolean;
}) {
  const langs = languagesOf(problem.starterCodes);
  const noCase = problem._count.testCases === 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
      <span className="shrink-0 font-mono text-[11px] text-fg-quiet">#{problem.id}</span>
      <Link href={`/problems/${problem.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-signal">
        {problem.title}
      </Link>

      <span className="shrink-0 font-mono text-[11px] text-fg-muted">
        {problem.category} · 난이도 {problem.difficulty}
        {problem.company ? ` · ${problem.company}` : ''}
      </span>

      {/* 지원 언어 — 빠진 쪽은 흐리게 남겨 "없다"는 사실이 보이게 한다 */}
      {problem.starterCodes !== undefined && (
        <span className="flex shrink-0 gap-1" title={`시작 코드: ${langs.length ? langs.join(', ') : '없음'}`}>
          {(['javascript', 'python'] as const).map((l) => (
            <span
              key={l}
              className={`rounded-[var(--radius-control)] border px-1.5 py-0.5 font-mono text-[10px] ${
                langs.includes(l)
                  ? 'border-hairline bg-paper text-fg-secondary'
                  : 'border-dashed border-amber-300 text-amber-700'
              }`}
            >
              {LANG_SHORT[l]}
            </span>
          ))}
        </span>
      )}

      <span
        className={`shrink-0 rounded-[var(--radius-control)] border px-1.5 py-0.5 font-mono text-[10px] ${
          noCase ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-hairline bg-paper text-fg-muted'
        }`}
      >
        케이스 {problem._count.testCases}
      </span>

      {showSubmissions && problem._count.submissions != null && (
        <span className="shrink-0 font-mono text-[10px] text-fg-quiet">제출 {problem._count.submissions}</span>
      )}

      <Link
        href={`/console/problems/${problem.id}`}
        className="shrink-0 rounded-[var(--radius-card)] border border-hairline px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-signal/40 hover:text-signal"
      >
        수정
      </Link>
    </div>
  );
}

// 문제 관리 — 등록(단건/일괄)과 문제 은행(조회·수정·삭제).
//
// 등록은 검토 권한자만, 문제 은행 관리는 problem.manage를 가진 사람이면 된다.
// 디베이트메이트도 자기가 만든 문제의 오탈자나 잘못된 테스트케이스를 직접 고칠 수 있어야
// 콘텐츠가 굴러간다 — 매번 운영진을 거치면 그 자체가 병목이 된다.
//
// 은행 목록이 답해야 하는 질문은 "무슨 문제가 있나"가 아니라 **"어느 것을 손봐야 하나"**다.
// 그래서 행마다 지원 언어와 케이스 수를 함께 적고, 손봐야 할 것만 모아 보는 거르개를 둔다.
//   케이스 없음   열어도 채점이 안 된다 — 가장 급하다
//   언어 미비     한쪽 언어의 시작 코드가 비어 있다
// 예전에는 "테스트케이스가 없는 문제 4개"라고 알려 주고는 링크가 그냥 은행 탭으로만 갔다.
// 어느 넷인지는 200개를 눈으로 훑어 찾아야 했다.
export default async function ProblemUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; filter?: string }>;
}) {
  const user = await getUser();
  const [canReview, canManage] = await Promise.all([
    can(user, 'problem.review'),
    can(user, 'problem.manage'),
  ]);
  if (!canReview && !canManage) redirect('/console');

  const { tab, q, filter } = await searchParams;
  const requested = tab === 'bulk' ? 'bulk' : tab === 'bank' ? 'bank' : 'single';
  // 등록 권한이 없으면(메이트) 문제 은행 탭만 의미가 있다
  const active = !canReview && requested !== 'bank' ? 'bank' : requested;
  const search = (q ?? '').trim();
  const view = filter === 'nocase' ? 'nocase' : filter === 'nolang' ? 'nolang' : 'all';

  // 한쪽 언어의 시작 코드가 비어 있는 문제. starterCodes가 Json이라 Prisma 필터로는
  // 표현이 지저분해져서 id만 SQL로 추려 온다.
  const missingLangIds =
    active === 'bank' && view === 'nolang'
      ? (
          await prisma.$queryRaw<{ id: number }[]>`
            SELECT "id" FROM "Problem"
            WHERE COALESCE("starterCodes"->>'javascript', '') = ''
               OR COALESCE("starterCodes"->>'python', '') = ''
          `
        ).map((r) => r.id)
      : [];

  const [totalProblems, noCaseCount, recent, pendingDrafts, bankRows] = await Promise.all([
    prisma.problem.count(),
    // 테스트케이스가 없는 문제 — 열어도 채점이 되지 않는다. 있으면 즉시 알려야 한다.
    prisma.problem.count({ where: { testCases: { none: {} } } }),
    prisma.problem.findMany({
      orderBy: { id: 'desc' },
      take: 6,
      select: {
        id: true,
        title: true,
        category: true,
        difficulty: true,
        starterCodes: true,
        _count: { select: { testCases: true } },
      },
    }),
    canReview ? prisma.problemDraft.count({ where: { status: 'pending' } }) : Promise.resolve(0),
    active === 'bank'
      ? prisma.problem.findMany({
          where: {
            ...(search
              ? {
                  OR: [
                    { title: { contains: search, mode: 'insensitive' as const } },
                    { category: { contains: search, mode: 'insensitive' as const } },
                    { company: { contains: search, mode: 'insensitive' as const } },
                  ],
                }
              : {}),
            ...(view === 'nocase' ? { testCases: { none: {} } } : {}),
            ...(view === 'nolang' ? { id: { in: missingLangIds } } : {}),
          },
          orderBy: { id: 'desc' },
          take: BANK_LIMIT,
          select: {
            id: true,
            title: true,
            category: true,
            difficulty: true,
            company: true,
            starterCodes: true,
            _count: { select: { testCases: true, submissions: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="PROBLEM MANAGEMENT"
        title="문제 관리"
        sub="테스트케이스까지 갖춘 완전한 형태로 등록하고, 게시된 문제를 고치거나 내립니다."
      />

      {noCaseCount > 0 && (
        <div className="mb-5">
          <Callout tone="danger" title={`테스트케이스가 없는 문제 ${noCaseCount}개`}>
            채점이 성립하지 않는 문제입니다. 이용자가 열면 제출해도 아무 판정이 나오지 않습니다.{' '}
            <Link
              href="/console/problems?tab=bank&filter=nocase"
              className="font-semibold underline underline-offset-2"
            >
              그 {noCaseCount}개만 보기
            </Link>
          </Callout>
        </div>
      )}

      <div className="mb-5">
        <StatGrid
          stats={[
            { label: '전체 문제', value: totalProblems },
            { label: '케이스 없음', value: noCaseCount, warn: noCaseCount > 0 },
            { label: '검토 대기 초안', value: pendingDrafts, warn: pendingDrafts > 0 },
            { label: '최근 등록', value: recent.length ? `#${recent[0].id}` : '—' },
          ]}
        />
      </div>

      <LinkTabs
        items={[
          ...(canReview
            ? [
                { href: '/console/problems?tab=single', label: '단건 등록', active: active === 'single' },
                { href: '/console/problems?tab=bulk', label: 'JSON 일괄 등록', active: active === 'bulk' },
              ]
            : []),
          { href: '/console/problems?tab=bank', label: `문제 은행 (${totalProblems})`, active: active === 'bank' },
        ]}
      />

      {active === 'single' && <UploadForm />}
      {active === 'bulk' && <BulkImport />}

      {active === 'bank' && (
        <div>
          {/* 검색은 GET 폼 — 결과 주소를 그대로 공유할 수 있다 */}
          <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="tab" value="bank" />
            {view !== 'all' && <input type="hidden" name="filter" value={view} />}
            <input
              name="q"
              defaultValue={search}
              placeholder="제목·카테고리·기업으로 검색"
              aria-label="문제 검색"
              className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2 text-sm sm:max-w-xs"
            />
            <button className="rounded-full bg-signal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
              검색
            </button>
            {(search || view !== 'all') && (
              <Link
                href="/console/problems?tab=bank"
                className="rounded-full border border-hairline px-3 py-2 text-xs text-fg-secondary transition-colors hover:border-signal/40 hover:text-signal"
              >
                초기화
              </Link>
            )}
          </form>

          {/* 손봐야 할 것만 모아 보는 거르개 */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: '전체' },
              { id: 'nocase', label: `케이스 없음${noCaseCount > 0 ? ` ${noCaseCount}` : ''}` },
              { id: 'nolang', label: '언어 미비' },
            ].map((f) => {
              const on = view === f.id;
              const params = new URLSearchParams({ tab: 'bank' });
              if (f.id !== 'all') params.set('filter', f.id);
              if (search) params.set('q', search);
              return (
                <Link
                  key={f.id}
                  href={`/console/problems?${params.toString()}`}
                  aria-current={on ? 'true' : undefined}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    on
                      ? 'border-signal bg-signal/[0.08] text-signal'
                      : 'border-hairline text-fg-secondary hover:border-signal/40 hover:text-signal'
                  }`}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>

          <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
            {bankRows.length === 0 && (
              <EmptyRow
                text={
                  view === 'nocase'
                    ? '테스트케이스가 빠진 문제가 없습니다.'
                    : view === 'nolang'
                      ? '두 언어의 시작 코드가 모두 채워져 있습니다.'
                      : search
                        ? '검색 결과가 없습니다.'
                        : '등록된 문제가 없습니다.'
                }
              />
            )}
            {bankRows.map((p) => (
              <ProblemRow key={p.id} problem={p} showSubmissions />
            ))}
          </div>

          {bankRows.length >= BANK_LIMIT && (
            <p className="mt-2 font-mono text-[11px] text-fg-muted">
              최근 {BANK_LIMIT}개까지 표시합니다. 검색으로 좁혀 보세요.
            </p>
          )}
        </div>
      )}

      {/* 최근 등록 — 방금 올린 것이 실제로 들어갔는지 확인하는 자리 */}
      {active !== 'bank' && (
        <div className="mt-10">
          <h3 className="mb-3 font-display text-[15px] font-bold tracking-tight text-fg">최근 등록된 문제</h3>
          <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
            {recent.length === 0 && <EmptyRow text="등록된 문제가 없습니다." />}
            {recent.map((p) => (
              <ProblemRow key={p.id} problem={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
