import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { deleteProblem } from '@/app/lib/actions/admin-problems';
import UploadForm from '../upload-form';
import DeleteProblemButton from './delete-button';
import { PageHeader, Callout, BTN_NEUTRAL } from '../../ui';

export const metadata: Metadata = { title: '문제 수정' };

// 문제 은행의 개별 문제 수정 — 등록 폼을 그대로 재사용한다.
export default async function EditProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!(await can(user, 'problem.manage'))) redirect('/console');

  const { id } = await params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId)) notFound();

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: {
      testCases: { orderBy: { order: 'asc' } },
      _count: { select: { submissions: true, runAttempts: true, debateQSessions: true, setItems: true } },
    },
  });
  if (!problem) notFound();

  const starters = (problem.starterCodes ?? {}) as Record<string, string>;
  const usage = problem._count.submissions + problem._count.runAttempts + problem._count.debateQSessions;

  return (
    <div>
      <PageHeader
        eyebrow={`PROBLEM #${problem.id}`}
        title="문제 수정"
        sub="저장하면 즉시 반영됩니다. 테스트케이스는 저장 시 통째로 교체됩니다."
        actions={
          <>
            <Link href={`/problems/${problem.id}`} className={BTN_NEUTRAL}>
              문제 보기 ↗
            </Link>
            <Link href="/console/problems?tab=bank" className={BTN_NEUTRAL}>
              목록으로
            </Link>
          </>
        }
      />

      {usage > 0 && (
        <div className="mb-5">
          <Callout tone="warn" title={`이미 ${usage}건의 풀이 기록이 있습니다`}>
            지문이나 테스트케이스를 바꾸면 기존 제출의 판정 근거와 어긋날 수 있습니다. 오류를 고치는 것이 아니라면
            새 문제로 올리는 편이 안전합니다.
          </Callout>
        </div>
      )}

      <UploadForm
        defaults={{
          id: problem.id,
          title: problem.title,
          difficulty: problem.difficulty,
          category: problem.category,
          description: problem.description,
          tags: ((problem.tags ?? []) as string[]).join(', '),
          keywords: ((problem.keywords ?? []) as string[]).join(', '),
          timeLimitMs: problem.timeLimitMs,
          company: problem.company ?? '',
          examYear: problem.examYear ?? '',
          starterJs: starters.javascript ?? '',
          starterPy: starters.python ?? '',
          cases: problem.testCases.map((tc) => ({
            input: JSON.stringify(tc.input),
            expected: JSON.stringify(tc.expected),
            isHidden: tc.isHidden,
          })),
        }}
      />

      <div className="mt-10 rounded-[var(--radius-panel)] border border-rose-200 bg-rose-50/40 p-5">
        <h3 className="text-sm font-bold text-rose-900">문제 삭제</h3>
        <p className="mt-1 text-xs leading-relaxed text-rose-800/80">
          {usage > 0
            ? `풀이 기록이 ${usage}건 남아 있어 삭제할 수 없습니다. 지우면 이용자의 제출 이력과 랭킹 근거가 함께 사라집니다.`
            : '되돌릴 수 없습니다. 테스트케이스·스크랩·문제집 편성에서도 함께 제거됩니다.'}
        </p>
        {usage === 0 && (
          <div className="mt-3">
            <DeleteProblemButton id={problem.id} title={problem.title} action={deleteProblem} />
          </div>
        )}
      </div>
    </div>
  );
}
