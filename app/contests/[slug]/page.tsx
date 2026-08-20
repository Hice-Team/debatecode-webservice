import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell } from '@/app/components/page-shell';
import I18nSlot from '@/app/components/i18n-slot';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';
import { DIFFICULTY_LABELS } from '@/app/lib/types';
import { SET_KIND_BADGE, SET_KIND_LABELS, isSetKind } from '@/app/lib/problem-sets';
import { setEntryHref } from '@/app/problems/[id]/entry-context';

const DIFFICULTY_BADGE: Record<number, string> = {
  1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  2: 'bg-sky-50 text-sky-700 border-sky-200',
  3: 'bg-brand-50 text-brand-700 border-brand-200',
  4: 'bg-rose-50 text-rose-600 border-rose-200',
};

async function loadSet(slug: string) {
  return prisma.problemSet.findUnique({
    where: { slug },
    include: {
      items: {
        orderBy: { order: 'asc' },
        include: {
          problem: { select: { id: true, title: true, difficulty: true, category: true, company: true, timeLimitMs: true } },
        },
      },
    },
  });
}

export async function generateMetadata({ params }: PageProps<'/contests/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const set = await prisma.problemSet.findUnique({ where: { slug }, select: { title: true, description: true } });
  return set ? { title: set.title, description: set.description } : { title: '문제집 세트' };
}

export default async function ProblemSetPage({ params }: PageProps<'/contests/[slug]'>) {
  const { slug } = await params;
  const set = await loadSet(slug);
  if (!set || !set.published) notFound();

  const session = await getSessionOptional();
  const problemIds = set.items.map((i) => i.problem.id);

  const solvedIds = new Set<number>();
  if (session && problemIds.length > 0) {
    const solved = await prisma.submission.findMany({
      where: { userId: session.userId, status: 'PASS', problemId: { in: problemIds } },
      distinct: ['problemId'],
      select: { problemId: true },
    });
    solved.forEach((s) => solvedIds.add(s.problemId));
  }

  const kindKey = isSetKind(set.kind) ? set.kind : 'exam';
  const solvedCount = solvedIds.size;
  const total = set.items.length;
  const percent = total > 0 ? Math.round((solvedCount / total) * 100) : 0;
  // 이어풀기 — 아직 풀지 않은 첫 문제
  const nextItem = set.items.find((i) => !solvedIds.has(i.problem.id)) ?? set.items[0];

  return (
    <PageShell width="4xl">
      <Link
        href="/contests"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-signal"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden>
          <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <I18nSlot k="back-to-contests" fallback="코딩테스트로 돌아가기" />
      </Link>

      {/* 세트 헤더 */}
      <header className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
        <div className="bg-gradient-to-r from-brand-900 via-brand-700 to-brand-500 px-6 py-6 text-white sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold">
              <I18nSlot k={`set-kind-${kindKey}`} fallback={SET_KIND_LABELS[kindKey]} />
            </span>
            {set.company && <span className="font-mono text-[11px] text-fg-on-dark-secondary">{set.company}</span>}
            {set.examYear && <span className="font-mono text-[11px] text-fg-on-dark-muted">{set.examYear}</span>}
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">{set.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-fg-on-dark-secondary">{set.description}</p>
        </div>

        <div className="grid grid-cols-2 divide-x divide-hairline border-t border-hairline sm:grid-cols-4">
          <div className="px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">
              <I18nSlot k="set-stat-problems" fallback="문제 수" />
            </p>
            <p className="mt-1 font-display text-xl font-bold text-ink">{total}</p>
          </div>
          <div className="px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">
              <I18nSlot k="set-stat-difficulty" fallback="난이도" />
            </p>
            <p className="mt-1 font-display text-xl font-bold text-ink">
              <I18nSlot k={`difficulty-${set.difficulty}`} fallback={DIFFICULTY_LABELS[set.difficulty] ?? '—'} />
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">
              <I18nSlot k="set-stat-time" fallback="권장 시간" />
            </p>
            <p className="mt-1 font-display text-xl font-bold text-ink">
              {set.timeLimitMin ? `${set.timeLimitMin}분` : '—'}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">
              <I18nSlot k="set-stat-progress" fallback="내 진행률" />
            </p>
            <p className="mt-1 font-display text-xl font-bold text-signal">{session ? `${percent}%` : '—'}</p>
          </div>
        </div>

        {session && total > 0 && (
          <div className="px-5 pb-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-colors"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-fg-muted">
              {solvedCount} / {total} <I18nSlot k="solved-label" fallback="해결" />
            </p>
          </div>
        )}
      </header>

      {nextItem && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-brand-200 bg-brand-50/60 px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-brand-600">
              {solvedCount > 0 ? (
                <I18nSlot k="set-continue" fallback="이어풀기" />
              ) : (
                <I18nSlot k="set-start" fallback="시작하기" />
              )}
            </p>
            <p className="mt-0.5 truncate font-semibold text-ink">{nextItem.problem.title}</p>
          </div>
          <Link
            href={setEntryHref(nextItem.problem.id, set.slug)}
            className="ml-auto shrink-0 rounded-xl bg-signal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98]"
          >
            <I18nSlot k="set-solve-cta" fallback="문제 풀러 가기 →" />
          </Link>
        </div>
      )}

      {/* 문제 목록 */}
      <section className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
        <div className="border-b border-hairline px-5 py-3">
          <h2 className="font-semibold text-ink">
            <I18nSlot k="set-problem-list" fallback="세트 구성 문제" />
          </h2>
        </div>
        <ol className="divide-y divide-ink/5">
          {set.items.map((item, index) => {
            const done = solvedIds.has(item.problem.id);
            return (
              <li key={item.id}>
                <Link
                  href={setEntryHref(item.problem.id, set.slug)}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-brand-50/40"
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${
                      done ? 'bg-emerald-100 text-emerald-700' : 'bg-ink/[0.06] text-fg-muted'
                    }`}
                  >
                    {done ? '✓' : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{item.problem.title}</span>
                    <span className="font-mono text-[11px] text-fg-quiet">{item.problem.category}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      DIFFICULTY_BADGE[item.problem.difficulty] ?? DIFFICULTY_BADGE[2]
                    }`}
                  >
                    <I18nSlot
                      k={`difficulty-${item.problem.difficulty}`}
                      fallback={DIFFICULTY_LABELS[item.problem.difficulty]}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
          {total === 0 && (
            <li className="px-5 py-14 text-center text-sm text-fg-quiet">
              <I18nSlot k="set-empty" fallback="아직 이 세트에 편성된 문제가 없습니다." />
            </li>
          )}
        </ol>
      </section>
    </PageShell>
  );
}
