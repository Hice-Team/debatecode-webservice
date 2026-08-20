import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canAuthorProblems } from '@/app/lib/roles';
import DraftForm from '../draft-form';
import { PageHeader, EmptyRow } from '../ui';

export const metadata: Metadata = { title: '내 문제 초안' };

const DRAFT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '검토 대기', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  approved: { label: '승인·게시됨', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: '반려', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
};

// 내 문제 초안 — 초안 제출 + 검토 현황. 승인되면 문제 은행에 게시된다.
export default async function DraftsPage() {
  const user = await getUser();
  if (!canAuthorProblems(user.role)) redirect('/console');

  const myDrafts = await prisma.problemDraft.findMany({
    where: { authorId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return (
    <div>
      <PageHeader eyebrow="DRAFTS" title="내 문제 초안" sub="제출한 초안은 검토자 승인 후 문제 은행에 게시됩니다." />

      <div className="mb-4 rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
        <DraftForm />
      </div>

      <div className="divide-y divide-ink/5 rounded-[var(--radius-panel)] border border-hairline bg-white">
        {myDrafts.length === 0 && <EmptyRow text="아직 제출한 초안이 없습니다." />}
        {myDrafts.map((d) => {
          const st = DRAFT_STATUS[d.status] ?? DRAFT_STATUS.pending;
          return (
            <div key={d.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${st.cls}`}>{st.label}</span>
              <span className="truncate font-medium text-ink">{d.title}</span>
              <span className="font-mono text-[11px] text-fg-muted">{d.category} · 난이도 {d.difficulty}</span>
              {(d.copyrightDelegation as { donated?: boolean } | null)?.donated && (
                <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">
                  저작권 기증
                </span>
              )}
              {d.reviewNote && <span className="truncate text-xs text-fg-muted">— {d.reviewNote}</span>}
              <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-muted">{d.createdAt.toLocaleDateString('ko-KR')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
