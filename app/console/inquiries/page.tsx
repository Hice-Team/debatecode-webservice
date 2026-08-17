import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canReview } from '@/app/lib/roles';
import { maskEmail } from '@/app/lib/privacy';
import { closeInquiry } from '@/app/lib/actions/admin';
import InquiryReply from '../inquiry-reply';
import { PageHeader, SectionHeader, EmptyRow, BTN_NEUTRAL } from '../ui';

export const metadata: Metadata = { title: '문의 처리' };

// 문의 처리 큐 — 미답변/답변됨 문의에 답변하고, 답변 완료 건은 보관(closed)한다.
export default async function InquiryManagementPage() {
  const user = await getUser();
  if (!canReview(user.role)) redirect('/console');

  const [inquiries, closed] = await Promise.all([
    prisma.inquiry.findMany({ where: { status: { in: ['open', 'answered'] } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.inquiry.findMany({ where: { status: 'closed' }, orderBy: { answeredAt: 'desc' }, take: 15 }),
  ]);

  return (
    <div>
      <PageHeader eyebrow="INQUIRY MANAGEMENT" title="문의 처리 큐" sub="사용자 문의에 답변하면 상태가 ANSWERED로 바뀌고, 보관하면 목록에서 정리됩니다." />

      <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white">
        {inquiries.length === 0 && <EmptyRow text="문의가 없습니다." />}
        {inquiries.map((q) => (
          <div key={q.id} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                  q.status === 'open' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {q.status === 'open' ? 'OPEN' : 'ANSWERED'}
              </span>
              <span className="truncate font-medium text-ink">{q.subject}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-soft/50">
                {maskEmail(q.email)} · {q.createdAt.toLocaleDateString('ko-KR')}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft/70">{q.body}</p>
            {q.answer ? (
              <div className="mt-2 flex items-start gap-2">
                <form action={closeInquiry}>
                  <input type="hidden" name="id" value={q.id} />
                  <button className={BTN_NEUTRAL}>보관</button>
                </form>
                <p className="text-sm text-emerald-800/80">
                  <span className="mr-1 font-mono text-[11px]">답변:</span>
                  {q.answer}
                </p>
              </div>
            ) : (
              <InquiryReply id={q.id} />
            )}
          </div>
        ))}
      </div>

      <div className="mt-10">
        <SectionHeader title="보관된 문의" />
        <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white">
          {closed.length === 0 && <EmptyRow text="보관된 문의가 없습니다." />}
          {closed.map((q) => (
            <div key={q.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className="shrink-0 rounded-full border border-ink/10 bg-paper px-2 py-0.5 font-mono text-[10px] text-ink-soft/55">CLOSED</span>
              <span className="truncate font-medium text-ink">{q.subject}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-soft/45">{q.createdAt.toLocaleDateString('ko-KR')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
