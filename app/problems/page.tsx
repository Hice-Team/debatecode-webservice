import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import I18nSlot from '@/app/components/i18n-slot';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';
import { DIFFICULTY_LABELS, LANGUAGE_LABELS, problemLanguages } from '@/app/lib/types';
import WorkbookBookmark from '@/app/components/workbook-bookmark';
import ProblemFilters from './problem-filters';
import Pagination from '@/app/components/pagination';

export const metadata: Metadata = { title: '문제집' };

const DIFFICULTY_BADGE: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  2: 'bg-sky-100 text-sky-700 border-sky-200',
  3: 'bg-amber-100 text-amber-700 border-amber-200',
  4: 'bg-rose-100 text-rose-700 border-rose-200',
};

const PAGE_SIZE = 12;

function getParamList(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return [value];
  return [];
}

export default async function ProblemsPage({ searchParams }: PageProps<'/problems'>) {
  const params = await searchParams;
  const { difficulty, category, language, company, q, page } = params;
  const difficultyValues = getParamList(difficulty).map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v));
  const categoryValues = getParamList(category);
  const languageValues = getParamList(language);
  const companyValues = getParamList(company);
  const queryStr = typeof q === 'string' ? q.trim() : undefined;
  const pageNum = Number.parseInt(typeof page === 'string' ? page : '1', 10);
  const currentPage = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;

  const session = await getSessionOptional();

  // 난이도/카테고리/기업/검색은 DB where 절로 필터링.
  // 언어만 starterCodes(JSON) 구조상 DB 필터가 어려워 in-memory로 거른다 —
  // 언어 필터가 활성일 때는 페이지네이션 전에 전체 후보를 가져와야 개수가 맞는다.
  //
  // starterCodes는 이제 필터와 무관하게 **항상** 가져온다. 목록의 LANG 칸이 지원 언어를
  // 보여 주기 때문이다. 문제 하나당 코드 두 조각이라 목록 12개면 무시할 만한 크기다.
  const baseWhere = {
    ...(difficultyValues.length > 0 ? { difficulty: { in: difficultyValues } } : {}),
    ...(categoryValues.length > 0 ? { category: { in: categoryValues } } : {}),
    ...(companyValues.length > 0 ? { company: { in: companyValues } } : {}),
    ...(queryStr ? { title: { contains: queryStr, mode: 'insensitive' as const } } : {}),
  };
  const languageActive = languageValues.length > 0;

  const [candidates, totalMatched, categories, companies, workbooks, passSubmissions] = await Promise.all([
    prisma.problem.findMany({
      where: baseWhere,
      orderBy: [{ difficulty: 'asc' }, { id: 'asc' }],
      // starterCodes(JSON)는 언어 필터가 활성일 때만 필요 — 평소에는 내려받지 않는다.
      select: {
        id: true,
        title: true,
        difficulty: true,
        category: true,
        company: true,
        starterCodes: true,
      },
      ...(languageActive ? {} : { skip: (currentPage - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    }),
    prisma.problem.count({ where: baseWhere }),
    prisma.problem.findMany({ select: { category: true }, distinct: ['category'] }),
    prisma.problem.findMany({
      where: { company: { not: null } },
      select: { company: true },
      distinct: ['company'],
    }),
    session
      ? (async () => {
          await prisma.workbook.upsert({ where: { userId_name: { userId: session.userId, name: '기본 문제집' } }, create: { userId: session.userId, name: '기본 문제집', isDefault: true }, update: {} });
          return prisma.workbook.findMany({ where: { userId: session.userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true, name: true, isDefault: true, items: { select: { problemId: true } } } });
        })()
      : Promise.resolve([]),
    session
      ? prisma.submission.findMany({
          where: { userId: session.userId, status: 'PASS' },
          select: { problemId: true, interview: { select: { defenseScore: true } } },
        })
      : Promise.resolve([]),
  ]);

  // 고른 언어 중 **하나라도** 풀 수 있으면 남긴다(OR).
  // AND로 두면 "JavaScript도 되고 Python도 되는 문제"만 남아, 언어를 하나 더 고를수록
  // 결과가 줄어든다 — 고르는 사람의 기대와 반대다.
  const languageFiltered = languageActive
    ? candidates.filter((p) => {
        const langs = problemLanguages(p.starterCodes);
        return languageValues.some((wanted) => langs.includes(wanted as (typeof langs)[number]));
      })
    : candidates;
  const totalCount = languageActive ? languageFiltered.length : totalMatched;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const problems = languageActive
    ? languageFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : languageFiltered;
  const savedProblemIds = new Set(workbooks.flatMap((book) => book.items.map((item) => item.problemId)));

  const solvedMap = new Map<number, { passed: boolean; bestScore: number | null }>();
  for (const s of passSubmissions) {
    const prev = solvedMap.get(s.problemId);
    const score = s.interview?.defenseScore ?? null;
    solvedMap.set(s.problemId, {
      passed: true,
      bestScore:
        prev?.bestScore != null && (score == null || prev.bestScore >= score)
          ? prev.bestScore
          : score,
    });
  }

  return (
    <PageShell width="5xl">
        <PageHeader
          slug="challenge-list"
          title="문제집"
          desc="테스트를 전부 통과하면 AI 면접관과의 디베이트가 시작됩니다."
          actions={
            session && (
              // 글자 링크였을 때는 헤더 오른쪽 구석에 묻혀 있었다. 문제집에서 두 번째로
              // 자주 가는 곳이라 누를 것처럼 보여야 한다 — 다만 채워진 버튼은 아니다.
              // 이 화면의 주요 행동은 문제를 고르는 것이고, 채운 버튼은 한 화면에 하나다.
              <Link
                href="/problems/mine"
                className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-brand-200 bg-brand-50 px-4 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                  <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
                </svg>
                <I18nSlot k="my-problems" fallback="내 문제집" />
              </Link>
            )
          }
        />

        <ProblemFilters
          categories={categories.map((c) => c.category)}
          companies={companies.map((c) => c.company!).filter(Boolean)}
          activeDifficulties={difficultyValues}
          activeCategories={categoryValues}
          activeLanguages={languageValues}
          activeCompanies={companyValues}
          activeQuery={queryStr}
        />

        {/* 목록은 카드가 아니라 줄이다(DESIGN.md §5). 밀도를 위해 좌우 여백을 px-6→px-4로
            줄이고, 칸마다 다르던 정렬을 하나로 맞춘다 —
            글자는 왼쪽, 배지·숫자는 가운데, 성공률만 오른쪽. */}
        <div className="mt-6 overflow-hidden overflow-x-auto rounded-[var(--radius-panel)] border border-hairline bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-hairline font-mono text-[11px] tracking-wider text-fg-muted">
                <th className="w-10 px-4 py-2.5 text-center font-medium">
                  <span className="sr-only">해결 여부</span>
                </th>
                {session && <th className="w-8 px-1 py-2.5 font-medium" />}
                <th className="w-full px-3 py-2.5 text-left font-medium">TITLE</th>
                <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">LANG</th>
                <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">CATEGORY</th>
                <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">LEVEL</th>
                <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                  <I18nSlot k="defense-success-rate" fallback="방어 성공률" />
                </th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => {
                const solved = solvedMap.get(p.id);
                return (
                  <tr key={p.id} className="border-b border-hairline transition-colors last:border-0 hover:bg-paper">
                    <td className="px-4 py-2.5 text-center">
                      {solved?.passed ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs">✓</span>
                      ) : (
                        <span className="inline-block w-5 h-5 rounded-full border border-hairline" />
                      )}
                    </td>
                    {session && (
                      <td className="px-1 py-2.5 text-center">
                        <WorkbookBookmark
                          problemId={p.id}
                          workbooks={workbooks.map((book) => ({
                            id: book.id,
                            name: book.name,
                            isDefault: book.isDefault,
                            saved: book.items.some((item) => item.problemId === p.id),
                          }))}
                          isSaved={savedProblemIds.has(p.id)}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <Link href={`/problems/${p.id}`} className="font-medium transition-colors hover:text-signal">
                        {p.title}
                      </Link>
                      {p.company && (
                        <span className="ml-2 align-middle text-[10px] font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5">
                          {p.company} <I18nSlot k="company-variant-label" fallback="변형" />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {(() => {
                        const langs = problemLanguages(p.starterCodes);
                        // 스타터 코드가 하나도 없는 문제 — 조용히 비우면 "왜 못 푸는지"를
                        // 목록에서 알 수 없다. 상태를 감추지 않는다.
                        if (langs.length === 0) {
                          return <span className="font-mono text-[11px] text-fg-quiet">준비 중</span>;
                        }
                        return (
                          <span className="flex flex-wrap justify-center gap-1">
                            {langs.map((l) => (
                              <span
                                key={l}
                                className="rounded-[var(--radius-control)] bg-paper px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
                              >
                                {LANGUAGE_LABELS[l]}
                              </span>
                            ))}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs whitespace-nowrap text-fg-muted">{p.category}</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${DIFFICULTY_BADGE[p.difficulty]}`}>
                        <I18nSlot k={p.difficulty === 1 ? 'beginner' : p.difficulty === 2 ? 'easy' : p.difficulty === 3 ? 'medium' : 'hard'} fallback={DIFFICULTY_LABELS[p.difficulty]} />
                      </span>
                    </td>
                    <td className="dc-num px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                      {solved?.bestScore != null ? (
                        <span className={solved.bestScore >= 70 ? 'text-emerald-600' : 'text-brand-600'}>
                          {solved.bestScore}%
                        </span>
                      ) : (
                        <span className="text-fg-quiet">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {problems.length === 0 && (
                <tr>
                  <td colSpan={session ? 7 : 6} className="px-6 py-16 text-center text-fg-muted">
                    <I18nSlot k="no-matched-problems" fallback="조건에 맞는 문제가 없습니다." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 아래에 여백을 둔다 — 마지막 줄이 화면 바닥에 붙으면
            목록이 더 있는지 끝난 것인지 알 수 없다. */}
        <div className="pb-16">
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            hrefFor={(p) => buildPageHref(p, params)}
          />
        </div>
    </PageShell>
  );
}

function buildPageHref(page: number, searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (typeof value === 'string') {
      params.set(key, value);
    }
  });
  params.set('page', String(page));
  return `/problems?${params.toString()}`;
}
