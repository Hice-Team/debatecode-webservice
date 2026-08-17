import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canReview } from '@/app/lib/roles';
import { maskName, maskEmail } from '@/app/lib/privacy';
import { reviewMateApplication, revokeDebateMate } from '@/app/lib/actions/admin';
import { PageHeader, SectionHeader, EmptyRow, BTN_APPROVE, BTN_REJECT } from '../ui';

export const metadata: Metadata = { title: '디베이트메이트 관리' };

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  approved: { label: '승인', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: '반려', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  revoked: { label: '권한 회수', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
};

// 디베이트메이트 관리 — 신청서 검토(승인/반려 + 반려서), 활동 중인 메이트의 권한 회수까지 한곳에서.
export default async function MateManagementPage() {
  const user = await getUser();
  if (!canReview(user.role)) redirect('/console');

  const [pending, activeMates, processed] = await Promise.all([
    prisma.debateMateApplication.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true, email: true } } },
    }),
    // 활동 중인 메이트 — 출제 실적(초안 수)과 승인일을 함께 본다
    prisma.user.findMany({
      where: { role: 'debate_mate' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { problemDrafts: true, debateQSessions: true } },
        mateApplication: { select: { reviewedAt: true } },
      },
    }),
    prisma.debateMateApplication.findMany({
      where: { status: { in: ['approved', 'rejected', 'revoked'] } },
      orderBy: { reviewedAt: 'desc' },
      take: 15,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="MATE MANAGEMENT"
        title="디베이트메이트 관리"
        sub="신청서를 검토해 승인/반려하고, 활동 중인 메이트는 요청·활동 위반에 따라 권한을 회수할 수 있습니다. 반려서와 회수 사유는 신청자에게 표시됩니다."
      />

      {/* ---- 신청 대기 ---- */}
      <SectionHeader title={`신청 대기 (${pending.length})`} sub="승인하면 debate_mate 역할이 부여되고 debateQ·문제 출제가 열립니다." />
      <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white">
        {pending.length === 0 && <EmptyRow text="신청 대기 중인 사용자가 없습니다." />}
        {pending.map((m) => (
          <details key={m.id} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-brand-600 group-open:hidden">▶</span>
              <span className="hidden font-mono text-[10px] text-brand-600 group-open:inline">▼</span>
              <span className="font-medium text-ink">{maskName(m.user.name)}</span>
              <span className="font-mono text-[11px] text-ink-soft/55">{maskEmail(m.user.email)}</span>
              <span className="font-mono text-[11px] text-ink-soft/40">신청 {m.createdAt.toLocaleDateString('ko-KR')}</span>
              <span className="ml-auto rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-700">
                신청서 열람
              </span>
            </summary>

            {/* 신청서 본문 */}
            <div className="mt-3 rounded-xl border border-ink/10 bg-paper/40 p-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-soft/45">지원 동기</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft/80">{m.motivation}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {m.attachmentUrl && (
                  <a
                    href={m.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
                  >
                    📄 {m.attachmentName ?? '신청서 PDF'} ↗
                  </a>
                )}
                {m.portfolioUrl && (
                  <a href={m.portfolioUrl} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-brand-600 hover:underline">
                    포트폴리오 보기 ↗
                  </a>
                )}
              </div>
            </div>

            {/* 처리 — 반려 시 반려서(사유서)를 함께 보낸다 */}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
              <form action={reviewMateApplication} className="flex flex-1 items-start gap-2">
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="action" value="reject" />
                <textarea
                  name="note"
                  rows={2}
                  placeholder="반려서 — 반려 사유를 적어주세요. 신청자에게 그대로 전달됩니다. (선택)"
                  className="w-full flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs placeholder:text-ink-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                />
                <button className={BTN_REJECT}>반려</button>
              </form>
              <form action={reviewMateApplication}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="action" value="approve" />
                <button className={BTN_APPROVE}>승인</button>
              </form>
            </div>
          </details>
        ))}
      </div>

      {/* ---- 활동 중인 메이트 · 권한 회수 ---- */}
      <div className="mt-10">
        <SectionHeader
          title={`활동 중인 디베이트메이트 (${activeMates.length})`}
          sub="본인 요청 또는 활동 위반 시 권한을 회수합니다. 회수하면 일반 사용자로 돌아가며 사유가 이력에 남습니다."
        />
        <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white">
          {activeMates.length === 0 && <EmptyRow text="활동 중인 디베이트메이트가 없습니다." />}
          {activeMates.map((mate) => (
            <div key={mate.id} className="flex flex-col gap-2 px-5 py-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-[12px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {(mate.name[0] ?? '?').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{maskName(mate.name)}</p>
                  <p className="font-mono text-[11px] text-ink-soft/50">
                    메이트 승인 {mate.mateApplication?.reviewedAt ? mate.mateApplication.reviewedAt.toLocaleDateString('ko-KR') : '—'} ·
                    출제 초안 {mate._count.problemDrafts}건 · debateQ {mate._count.debateQSessions}회
                  </p>
                </div>
              </div>
              <form action={revokeDebateMate} className="flex flex-1 items-center gap-2 lg:justify-end">
                <input type="hidden" name="userId" value={mate.id} />
                <input
                  name="reason"
                  required
                  placeholder="회수 사유 (본인 요청 / 활동 위반 등)"
                  className="w-full max-w-xs rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs placeholder:text-ink-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                />
                <button className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">
                  권한 회수
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>

      {/* ---- 처리 이력 ---- */}
      <div className="mt-10">
        <SectionHeader title="처리 이력" sub="최근 승인·반려·회수 15건 — 반려서/회수 사유가 함께 남습니다." />
        <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white">
          {processed.length === 0 && <EmptyRow text="처리한 신청이 아직 없습니다." />}
          {processed.map((m) => {
            const st = STATUS_BADGE[m.status] ?? STATUS_BADGE.rejected;
            return (
              <div key={m.id} className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${st.cls}`}>{st.label}</span>
                  <span className="font-medium text-ink">{maskName(m.user.name)}</span>
                  <span className="ml-auto font-mono text-[11px] text-ink-soft/45">{m.reviewedAt?.toLocaleDateString('ko-KR')}</span>
                </div>
                {m.reviewNote && (
                  <p className="mt-1.5 rounded-lg border border-ink/10 bg-paper/40 px-3 py-2 text-xs leading-relaxed text-ink-soft/70">
                    {m.status === 'revoked' ? '회수 사유' : m.status === 'rejected' ? '반려서' : '메모'}: {m.reviewNote}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
