import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { deleteProblem } from '@/app/lib/actions/problems';
import { DIFFICULTY_LABELS } from '@/app/lib/types';

export const metadata: Metadata = { title: '문제 관리' };

export default async function AdminProblemsPage({ searchParams }: PageProps<'/dashboard/problems'>) {
  const user = await getUser();
  if (user.role !== 'admin') redirect('/dashboard');
  const { error } = await searchParams;

  const problems = await prisma.problem.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      title: true,
      difficulty: true,
      category: true,
      company: true,
      _count: { select: { testCases: true, submissions: true } },
    },
  });

  return (
    <PageShell width="4xl">
      <BackButton label="관리자 대시보드로" className="mb-4" />
      <PageHeader
        slug="problem-management"
        title="문제 관리"
        desc={`총 ${problems.length}문제. 제출 이력이 있는 문제는 기록 보존을 위해 삭제할 수 없습니다.`}
        className="mt-4 mb-6"
      />

      <div className="mb-6">
        <Link href="/problems/new" className="dc-btn-primary">
          + 새 문제 등록
        </Link>
      </div>

      {typeof error === 'string' && (
        <p className="mb-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>
      )}

      <div className="bg-surface rounded-xl border border-hairline divide-y divide-hairline">
        {problems.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 text-sm">
            <span className="font-mono text-[11px] text-fg-quiet w-8 shrink-0">#{p.id}</span>
            <Link href={`/problems/${p.id}`} className="font-semibold hover:text-brand-600 transition-colors truncate">
              {p.title}
            </Link>
            <span className="font-mono text-xs text-fg-muted shrink-0">{p.category}</span>
            <span className="text-[11px] text-fg-quiet shrink-0">{DIFFICULTY_LABELS[p.difficulty]}</span>
            {p.company && <span className="text-[11px] text-indigo-600 shrink-0">{p.company} 기출</span>}
            <span className="ml-auto font-mono text-[11px] text-fg-quiet shrink-0 hidden sm:inline">
              TC {p._count.testCases} · 제출 {p._count.submissions}
            </span>
            <Link
              href={`/problems/${p.id}/edit`}
              className="shrink-0 font-mono text-[11px] text-fg-secondary hover:text-signal underline underline-offset-2"
            >
              수정
            </Link>
            <form
              action={deleteProblem}
              className="shrink-0"
            >
              <input type="hidden" name="problemId" value={p.id} />
              <button
                type="submit"
                disabled={p._count.submissions > 0}
                title={p._count.submissions > 0 ? '제출 이력이 있어 삭제할 수 없습니다' : '문제 삭제'}
                className="font-mono text-[11px] text-rose-500/70 hover:text-rose-600 underline underline-offset-2 disabled:opacity-30 disabled:no-underline"
              >
                삭제
              </button>
            </form>
          </div>
        ))}
        {problems.length === 0 && (
          <div className="px-6 py-16 text-center text-sm text-fg-quiet">등록된 문제가 없습니다.</div>
        )}
      </div>
    </PageShell>
  );
}
