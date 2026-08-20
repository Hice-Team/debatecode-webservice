import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import I18nSlot from '@/app/components/i18n-slot';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';
import { DIFFICULTY_LABELS } from '@/app/lib/types';
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
  // 언어 필터만 starterCodes(JSON) 구조상 DB 필터가 어려워 in-memory 유지 —
  // 언어 필터가 활성일 때는 페이지네이션 전에 전체 후보를 가져와 거른다.
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
        starterCodes: languageActive,
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

  const languageFiltered = languageActive
    ? candidates.filter((p) => (p.starterCodes as Record<string, unknown>)[languageValues[0]] != null)
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
              <Link href="/problems/mine" className="inline-flex items-center gap-1.5 font-mono text-xs text-signal hover:underline whitespace-nowrap">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>
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

        <div className="mt-6 bg-white rounded-[var(--radius-panel)] border border-hairline overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-hairline font-mono text-[11px] text-fg-muted tracking-wider">
                <th className="text-left px-6 py-3 font-medium">STATUS</th>
                {session && <th className="text-left px-2 py-3 font-medium w-8" />}
                <th className="text-left px-4 py-3 font-medium w-full">TITLE</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">CATEGORY</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">LEVEL</th>
                <th className="text-right px-6 py-3 font-medium whitespace-nowrap">
                  <I18nSlot k="defense-success-rate" fallback="방어 성공률" />
                </th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => {
                const solved = solvedMap.get(p.id);
                return (
                  <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-paper/60 transition-colors">
                    <td className="px-6 py-4">
                      {solved?.passed ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs">✓</span>
                      ) : (
                        <span className="inline-block w-5 h-5 rounded-full border border-ink/15" />
                      )}
                    </td>
                    {session && (
                      <td className="px-2 py-4">
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
                    <td className="px-4 py-4">
                      <Link href={`/problems/${p.id}`} className="font-semibold hover:text-signal transition-colors">
                        {p.title}
                      </Link>
                      {p.company && (
                        <span className="ml-2 align-middle text-[10px] font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5">
                          {p.company} <I18nSlot k="company-variant-label" fallback="변형" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-fg-secondary whitespace-nowrap">{p.category}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-medium ${DIFFICULTY_BADGE[p.difficulty]}`}>
                        <I18nSlot k={p.difficulty === 1 ? 'beginner' : p.difficulty === 2 ? 'easy' : p.difficulty === 3 ? 'medium' : 'hard'} fallback={DIFFICULTY_LABELS[p.difficulty]} />
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xs whitespace-nowrap">
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
                  <td colSpan={session ? 6 : 5} className="px-6 py-16 text-center text-fg-quiet">
                    <I18nSlot k="no-matched-problems" fallback="조건에 맞는 문제가 없습니다." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          hrefFor={(p) => buildPageHref(p, params)}
        />
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
