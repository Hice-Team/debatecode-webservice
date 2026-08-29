import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import I18nSlot from '@/app/components/i18n-slot';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';
import { DIFFICULTY_LABELS } from '@/app/lib/types';
import { SET_KINDS, SET_KIND_BADGE, SET_KIND_LABELS, isSetKind, type SetKind } from '@/app/lib/problem-sets';
import ContestFilters from './contest-filters';
import Pagination from '@/app/components/pagination';

export const metadata: Metadata = { title: '코딩테스트' };

const PAGE_SIZE = 9; // 페이지당 세트 수

function getParamList(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return [value];
  return [];
}

export default async function ContestsPage({ searchParams }: PageProps<'/contests'>) {
  const params = await searchParams;
  const { q, company, year, kind, page } = params;
  const queryStr = typeof q === 'string' ? q.trim() : undefined;
  const activeCompanies = getParamList(company);
  const activeYears = getParamList(year);
  const activeKind: SetKind | undefined = isSetKind(kind) ? kind : undefined;
  const pageNum = Math.max(1, Number.parseInt(typeof page === 'string' ? page : '1', 10) || 1);

  const session = await getSessionOptional();

  const where = {
    published: true,
    ...(activeKind ? { kind: activeKind } : {}),
    ...(activeCompanies.length > 0 ? { company: { in: activeCompanies } } : {}),
    ...(activeYears.length > 0 ? { examYear: { in: activeYears } } : {}),
    ...(queryStr
      ? {
          OR: [
            { title: { contains: queryStr, mode: 'insensitive' as const } },
            { description: { contains: queryStr, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [sets, totalCount, kindCounts, companyRows, yearRows] = await Promise.all([
    prisma.problemSet.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        title: true,
        kind: true,
        description: true,
        company: true,
        examYear: true,
        difficulty: true,
        timeLimitMin: true,
        _count: { select: { items: true } },
        items: {
          orderBy: { order: 'asc' },
          take: 3,
          select: { problem: { select: { id: true, title: true, difficulty: true } } },
        },
      },
    }),
    prisma.problemSet.count({ where }),
    prisma.problemSet.groupBy({ by: ['kind'], where: { published: true }, _count: { _all: true } }),
    prisma.problemSet.findMany({
      where: { published: true, company: { not: null } },
      distinct: ['company'],
      select: { company: true },
      orderBy: { company: 'asc' },
    }),
    prisma.problemSet.findMany({
      where: { published: true, examYear: { not: null } },
      distinct: ['examYear'],
      select: { examYear: true },
    }),
  ]);

  const allCompanies = companyRows.map((s) => s.company!).filter(Boolean);
  const allYears = yearRows
    .map((s) => s.examYear!)
    .filter(Boolean)
    .sort()
    .reverse();
  const countByKind = new Map(kindCounts.map((row) => [row.kind, row._count._all]));

  // 로그인 사용자의 진행률 — 이 페이지에 보이는 세트의 문제들만 조회한다
  const visibleProblemIds = sets.flatMap((s) => s.items.map((i) => i.problem.id));
  const solvedIds = new Set<number>();
  if (session && visibleProblemIds.length > 0) {
    const solved = await prisma.submission.findMany({
      where: { userId: session.userId, status: 'PASS', problemId: { in: visibleProblemIds } },
      distinct: ['problemId'],
      select: { problemId: true },
    });
    solved.forEach((s) => solvedIds.add(s.problemId));
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildHref(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    activeCompanies.forEach((c) => sp.append('company', c));
    activeYears.forEach((y) => sp.append('year', y));
    if (queryStr) sp.set('q', queryStr);
    if (activeKind) sp.set('kind', activeKind);
    for (const [key, value] of Object.entries(overrides)) {
      sp.delete(key);
      if (value) sp.set(key, value);
    }
    const qs = sp.toString();
    return qs ? `/contests?${qs}` : '/contests';
  }

  return (
    <PageShell width="6xl">
      <PageHeader
        slug="coding-test"
        title="코딩테스트"
        className="mb-8"
        desc="기출 모음집과 실전 모의고사 — 이미 편성된 문제집 세트를 골라 순서대로 풀고, 그 자리에서 AI 면접관에게 방어하세요."
      />

      {/* 유형 탭 */}
      <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="세트 유형">
        <Link
          href={buildHref({ kind: undefined, page: undefined })}
          aria-current={!activeKind ? 'page' : undefined}
          className={`shrink-0 rounded-full border px-4 py-3 text-sm font-semibold transition-colors ${
            !activeKind
              ? 'border-signal bg-signal text-white'
              : 'border-hairline bg-surface text-fg-secondary hover:border-brand-300 hover:text-signal'
          }`}
        >
          <I18nSlot k="set-kind-all" fallback="전체" />
        </Link>
        {SET_KINDS.map((k) => (
          <Link
            key={k}
            href={buildHref({ kind: k, page: undefined })}
            aria-current={activeKind === k ? 'page' : undefined}
            className={`shrink-0 rounded-full border px-4 py-3 text-sm font-semibold transition-colors ${
              activeKind === k
                ? 'border-signal bg-signal text-white'
                : 'border-hairline bg-surface text-fg-secondary hover:border-brand-300 hover:text-signal'
            }`}
          >
            <I18nSlot k={`set-kind-${k}`} fallback={SET_KIND_LABELS[k]} />
            <span className="ml-1.5 font-mono text-[11px] opacity-60">{countByKind.get(k) ?? 0}</span>
          </Link>
        ))}
      </nav>

      <div className="mb-6">
        <ContestFilters
          companies={allCompanies}
          years={allYears}
          activeCompanies={activeCompanies}
          activeYears={activeYears}
          activeQuery={queryStr}
        />
      </div>

      {sets.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-16 text-center text-fg-quiet">
          <I18nSlot k="no-matched-contests" fallback="조건에 맞는 문제집 세트가 없습니다." />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((set) => {
            const kindKey = isSetKind(set.kind) ? set.kind : 'exam';
            const previewSolved = set.items.filter((i) => solvedIds.has(i.problem.id)).length;
            return (
              <Link
                key={set.id}
                href={`/contests/${set.slug}`}
                className="group flex flex-col rounded-[var(--radius-panel)] border border-hairline bg-surface p-5 transition hover:-translate-y-0.5 hover:border-brand-400/60 hover:shadow-lg hover:shadow-brand-500/10"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${SET_KIND_BADGE[kindKey]}`}>
                    <I18nSlot k={`set-kind-${kindKey}`} fallback={SET_KIND_LABELS[kindKey]} />
                  </span>
                  {set.examYear && (
                    <span className="font-mono text-[11px] text-fg-quiet">{set.examYear}</span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-fg-quiet">
                    <I18nSlot
                      k={`difficulty-${set.difficulty}`}
                      fallback={DIFFICULTY_LABELS[set.difficulty] ?? ''}
                    />
                  </span>
                </div>

                <h2 className="font-bold text-fg transition-colors group-hover:text-signal">{set.title}</h2>
                <p className="mt-1.5 line-clamp-2 text-sm text-fg-muted">{set.description}</p>

                <ul className="mt-3 space-y-1">
                  {set.items.map((item) => (
                    <li key={item.problem.id} className="flex items-center gap-2 text-xs text-fg-secondary">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          solvedIds.has(item.problem.id) ? 'bg-emerald-500' : 'bg-ink/15'
                        }`}
                        aria-hidden
                      />
                      <span className="truncate">{item.problem.title}</span>
                    </li>
                  ))}
                  {set._count.items > set.items.length && (
                    <li className="pl-3.5 font-mono text-[11px] text-fg-quiet">
                      + {set._count.items - set.items.length} <I18nSlot k="more-problems" fallback="문제 더" />
                    </li>
                  )}
                </ul>

                <div className="mt-auto flex items-center gap-3 border-t border-hairline pt-3 text-[11px] text-fg-muted">
                  <span className="font-mono">
                    {set._count.items} <I18nSlot k="problems-unit" fallback="문제" />
                  </span>
                  {set.timeLimitMin ? (
                    <span className="font-mono">{set.timeLimitMin}분</span>
                  ) : null}
                  {session && previewSolved > 0 && (
                    <span className="ml-auto font-mono font-semibold text-emerald-600">
                      {previewSolved}/{set.items.length} <I18nSlot k="solved-label" fallback="해결" />
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Pagination
        page={pageNum}
        totalPages={totalPages}
        totalCount={totalCount}
        hrefFor={(p) => buildHref({ page: p === 1 ? undefined : String(p) })}
      />

      <div className="mt-12 flex flex-col items-start gap-6 rounded-[var(--radius-panel)] bg-ink p-8 text-white sm:flex-row sm:items-center">
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            <I18nSlot k="mock-contest-title" fallback="실전 모의 코딩테스트" />
          </h3>
          <p className="text-sm text-fg-on-dark-secondary">
            <I18nSlot
              k="mock-contest-desc"
              fallback={
                <>
                  시간 제한 속에서 문제를 풀고 곧바로 압박 면접까지 — 면접 시작 시{' '}
                  <strong className="text-brand-300">엄격 모드</strong>를 선택하면 답변마다 제한 시간이 걸립니다.
                </>
              }
            />
          </p>
        </div>
        <Link
          href="/contests?kind=mock"
          className="shrink-0 rounded-lg bg-signal px-6 py-3 font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98] sm:ml-auto"
        >
          <I18nSlot k="challenge-now" fallback="지금 도전하기" />
        </Link>
      </div>
    </PageShell>
  );
}
