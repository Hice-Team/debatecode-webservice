import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canReview } from '@/app/lib/roles';
import { maskName } from '@/app/lib/privacy';
import { reviewProblemDraft } from '@/app/lib/actions/admin';
import { PageHeader, SectionHeader, EmptyRow, BTN_APPROVE, BTN_REJECT } from '../ui';

export const metadata: Metadata = { title: '문제 검토' };

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  approved: { label: '승인·게시됨', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: '반려', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
};

// 문제 검토큐 — 디베이트메이트/출제자 초안을 검토·승인하면 문제 은행에 게시된다.
export default async function ProblemReviewPage() {
  const user = await getUser();
  if (!canReview(user.role)) redirect('/console');

  const [pending, processed] = await Promise.all([
    prisma.problemDraft.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { author: { select: { name: true } } },
    }),
    prisma.problemDraft.findMany({
      where: { status: { in: ['approved', 'rejected'] } },
      orderBy: { reviewedAt: 'desc' },
      take: 15,
      include: { author: { select: { name: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="PROBLEM REVIEW"
        title="문제 검토큐"
        sub="디베이트메이트가 출제한 문제를 검토하고 승인하면 문제 은행에 게시됩니다. 반려 시 사유를 함께 남길 수 있습니다."
      />

      <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white">
        {pending.length === 0 && <EmptyRow text="검토 대기 중인 문제가 없습니다." />}
        {pending.map((d) => (
          <details key={d.id} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">
                  <span className="mr-1.5 font-mono text-[10px] text-brand-600 group-open:hidden">▶</span>
                  <span className="mr-1.5 hidden font-mono text-[10px] text-brand-600 group-open:inline">▼</span>
                  {d.title}
                </p>
                <p className="font-mono text-[11px] text-ink-soft/55">
                  {maskName(d.author.name)} · 난이도 {d.difficulty} · {d.category} · {d.createdAt.toLocaleDateString('ko-KR')}
                </p>
              </div>
            </summary>
            <div className="mt-3 rounded-xl border border-ink/10 bg-paper/40 p-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-soft/45">문제 설명</p>
              <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink-soft/80">{d.description}</p>
              {(() => {
                const cd = d.copyrightDelegation as { donated?: boolean; signerName?: string; agreedAt?: string } | null;
                return cd?.donated ? (
                  <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                    저작권 기증 위임서 제출됨 · 서명 {cd.signerName} · {cd.agreedAt ? new Date(cd.agreedAt).toLocaleDateString('ko-KR') : ''}
                  </p>
                ) : (
                  <p className="mt-3 font-mono text-[11px] text-ink-soft/45">저작권: 창작자 보유 (위임서 미제출)</p>
                );
              })()}
            </div>
            {/* 검토 처리 — 반려 사유(선택)를 포함해 승인/반려 */}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <form action={reviewProblemDraft} className="flex flex-1 items-center gap-2">
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="action" value="reject" />
                <input
                  name="note"
                  placeholder="반려 사유 (선택 — 출제자에게 표시됩니다)"
                  className="w-full flex-1 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs placeholder:text-ink-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                />
                <button className={BTN_REJECT}>반려</button>
              </form>
              <form action={reviewProblemDraft}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="action" value="approve" />
                <button className={BTN_APPROVE}>승인·게시</button>
              </form>
            </div>
          </details>
        ))}
      </div>

      {/* 최근 처리 이력 */}
      <div className="mt-10">
        <SectionHeader title="최근 처리 이력" sub="최근 승인/반려된 초안 15건입니다." />
        <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white">
          {processed.length === 0 && <EmptyRow text="처리한 초안이 아직 없습니다." />}
          {processed.map((d) => {
            const st = STATUS_BADGE[d.status] ?? STATUS_BADGE.rejected;
            return (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${st.cls}`}>{st.label}</span>
                <span className="truncate font-medium text-ink">{d.title}</span>
                <span className="font-mono text-[11px] text-ink-soft/45">{maskName(d.author.name)} · {d.category}</span>
                {d.reviewNote && <span className="truncate text-xs text-ink-soft/55">— {d.reviewNote}</span>}
                <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-soft/45">
                  {d.reviewedAt?.toLocaleDateString('ko-KR')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
