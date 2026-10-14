import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import EditorUnavailable from '@/app/components/editor-unavailable';
import { canUseEditor, getDeviceClass } from '@/app/lib/device';
import { getUser } from '@/app/lib/dal';
import ProblemEditor, { type ProblemInitial } from '../../new/problem-editor';
import { problemLanguages } from '@/app/lib/types';

export const metadata: Metadata = { title: '문제 수정' };

export default async function EditProblemPage({ params }: PageProps<'/problems/[id]/edit'>) {
  if (!canUseEditor(await getDeviceClass())) {
    return <EditorUnavailable title="문제 수정은 스마트폰에서 할 수 없습니다" />;
  }

  const user = await getUser();
  if (user.role !== 'admin') redirect('/problems');

  const { id } = await params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId)) notFound();

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: { testCases: { orderBy: { order: 'asc' } } },
  });
  if (!problem) notFound();

  const starters = problem.starterCodes as { javascript?: string; python?: string };
  const initial: ProblemInitial = {
    id: problem.id,
    title: problem.title,
    slug: problem.slug,
    difficulty: problem.difficulty,
    category: problem.category,
    tags: (problem.tags as string[]) ?? [],
    description: problem.description,
    timeLimitMs: problem.timeLimitMs,
    company: problem.company ?? '',
    examYear: problem.examYear ?? '',
    starterJs: starters.javascript ?? '',
    starterPy: starters.python ?? '',
    // 지원 언어는 별도 컬럼이 아니라 스타터 코드가 들어 있는 언어다(problemLanguages).
    languages: problemLanguages(problem.starterCodes),
    keywords: (problem.keywords as string[]) ?? [],
    testCases: problem.testCases.map((tc) => ({
      input: JSON.stringify(tc.input),
      expected: JSON.stringify(tc.expected),
      isHidden: tc.isHidden,
    })),
  };

  return (
    <PageShell width="4xl">
      <BackButton label="문제 관리로 돌아가기" className="mb-4" />
      <PageHeader
        slug="problem-editor"
        title={`문제 수정 — ${problem.title}`}
        desc="저장 시 테스트케이스는 아래 목록으로 전체 교체됩니다."
        className="mt-4 mb-8"
      />
      <div className="dc-card p-8">
        <ProblemEditor initial={initial} />
      </div>
    </PageShell>
  );
}
