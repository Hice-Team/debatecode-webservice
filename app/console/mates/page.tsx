import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { maskName, maskEmail } from '@/app/lib/privacy';
import { reviewMateApplication } from '@/app/lib/actions/admin';
import { WarnForm, RevokeForm } from './mate-actions';
import {
  PageHeader,
  LinkTabs,
  StatGrid,
  Callout,
  EmptyState,
  SlaBadge,
  BTN_APPROVE,
  BTN_REJECT,
} from '../ui';

export const metadata: Metadata = { title: '디베이트메이트 관리' };

type Tab = 'pending' | 'active' | 'history';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  approved: { label: '승인', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: '반려', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  revoked: { label: '권한 회수', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
};

const INACTIVE_DAYS = 30;

// 디베이트메이트 관리 — 신청 심사 / 활동 현황 / 이력.
//
// 예전에는 세 가지가 한 화면에 세로로 쌓여 있어서, 신청 하나를 보려고 활동 중인 메이트
// 목록 전체를 지나쳐야 했다. 탭으로 나누고, 활동 탭에는 "지금 이 사람이 실제로 활동
// 중인가"를 판단할 지표(승인률·최근 활동일·경고 수)를 붙였다.
export default async function MateManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getUser();
  if (!(await can(user, 'mate.review'))) redirect('/console');

  const { tab } = await searchParams;
  const active: Tab = tab === 'active' || tab === 'history' ? tab : 'pending';

  const [pending, mates, processed] = await Promise.all([
    prisma.debateMateApplication.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.user.findMany({
      where: { role: 'debate_mate' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { debateQSessions: true } },
        problemDrafts: { select: { status: true, createdAt: true } },
        mateApplication: { select: { reviewedAt: true } },
        pointEntries: { select: { amount: true } },
      },
    }),
    prisma.debateMateApplication.findMany({
      where: { status: { in: ['approved', 'rejected', 'revoked'] } },
      orderBy: { reviewedAt: 'desc' },
      take: 30,
      include: { user: { select: { name: true } } },
    }),
  ]);

  // 경고 이력 — 별도 표 없이 감사 로그에서 센다
  const warnRows = await prisma.auditLog
    .findMany({
      where: { action: 'mate.warn', targetId: { in: mates.map((m) => m.id) } },
      select: { targetId: true, summary: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => []);
  const warnsByUser = new Map<string, { summary: string; createdAt: Date }[]>();
  for (const w of warnRows) {
    if (!w.targetId) continue;
    const list = warnsByUser.get(w.targetId) ?? [];
    list.push({ summary: w.summary, createdAt: w.createdAt });
    warnsByUser.set(w.targetId, list);
  }

  const now = new Date().getTime();
  const enriched = mates.map((m) => {
    const drafts = m.problemDrafts;
    const approved = drafts.filter((d) => d.status === 'approved').length;
    const reviewed = drafts.filter((d) => d.status !== 'pending').length;
    const lastActivity = drafts.length
      ? drafts.reduce((max, d) => (d.createdAt > max ? d.createdAt : max), drafts[0].createdAt)
      : (m.mateApplication?.reviewedAt ?? m.createdAt);
    const balance = m.pointEntries.reduce((sum, e) => sum + e.amount, 0);
    const warns = warnsByUser.get(m.id) ?? [];
    return {
      id: m.id,
      name: maskName(m.name),
      approvedAt: m.mateApplication?.reviewedAt ?? null,
      drafts: drafts.length,
      approved,
      // 승인률은 심사가 끝난 초안 기준 — 대기 중인 것까지 분모에 넣으면 실제보다 낮게 보인다
      approvalRate: reviewed > 0 ? Math.round((approved / reviewed) * 100) : null,
      sessions: m._count.debateQSessions,
      balance,
      lastActivity,
      inactiveDays: Math.floor((now - lastActivity.getTime()) / 86400_000),
      warns,
    };
  });

  const inactive = enriched.filter((m) => m.inactiveDays >= INACTIVE_DAYS).length;
  const flagged = enriched.filter((m) => m.warns.length >= 3).length;

  return (
    <div>
      <PageHeader
        eyebrow="MATE MANAGEMENT"
        title="디베이트메이트 관리"
        sub="신청 심사와 활동 중인 메이트의 실적·경고·권한 회수를 다룹니다."
      />

      {flagged > 0 && (
        <div className="mb-5">
          <Callout tone="warn" title={`경고 3회 이상 누적된 메이트 ${flagged}명`}>
            활동 탭에서 확인하세요. 계속 문제가 반복되면 권한 회수를 검토할 단계입니다.
          </Callout>
        </div>
      )}

      <div className="mb-5">
        <StatGrid
          stats={[
            { label: '신청 대기', value: pending.length, warn: pending.length > 0 },
            { label: '활동 중', value: enriched.length },
            { label: `${INACTIVE_DAYS}일 무활동`, value: inactive, warn: inactive > 0 },
            { label: '경고 누적', value: flagged, warn: flagged > 0 },
          ]}
        />
      </div>

      <LinkTabs
        items={[
          { href: '/console/mates?tab=pending', label: '신청 대기', count: pending.length, active: active === 'pending' },
          { href: '/console/mates?tab=active', label: '활동 중', count: enriched.length, active: active === 'active' },
          { href: '/console/mates?tab=history', label: '처리 이력', active: active === 'history' },
        ]}
      />

      {/* ---- 신청 대기 ---- */}
      {active === 'pending' && (
        <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
          {pending.length === 0 && (
            <EmptyState title="신청 대기 중인 사용자가 없습니다" sub="새 신청이 들어오면 여기에 나타납니다." />
          )}
          {pending.map((m) => (
            <details key={m.id} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-brand-600 group-open:hidden">▶</span>
                <span className="hidden font-mono text-[10px] text-brand-600 group-open:inline">▼</span>
                <span className="font-medium text-fg">{maskName(m.user.name)}</span>
                <span className="font-mono text-[11px] text-fg-muted">{maskEmail(m.user.email)}</span>
                <span className="font-mono text-[11px] text-fg-quiet">
                  신청 {m.createdAt.toLocaleDateString('ko-KR')}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <SlaBadge since={m.createdAt} />
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-700">
                    신청서 열람
                  </span>
                </span>
              </summary>

              {/* 신청서 PDF가 곧 지원서다 — 심사자가 가장 먼저 열어야 하는 것이라 맨 위에 둔다.
                  지원 동기는 예전 신청서에만 남아 있어 있을 때만 그린다. */}
              <div className="mt-3 rounded-xl border border-hairline bg-paper/40 p-4">
                {m.attachmentUrl ? (
                  <a
                    href={m.attachmentUrl}
                    download={m.attachmentName ?? '신청서.pdf'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden>
                      <path d="M12 4v11m0 0 3.5-3.5M12 15l-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17" strokeLinecap="round" />
                    </svg>
                    {m.attachmentName ?? '신청서 PDF'} 내려받기
                  </a>
                ) : (
                  <p className="text-sm text-fg-muted">첨부된 신청서가 없습니다.</p>
                )}

                {m.motivation && (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                      지원 동기 (예전 양식)
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{m.motivation}</p>
                  </div>
                )}
                {m.portfolioUrl && (
                  <a
                    href={m.portfolioUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block font-mono text-[11px] text-brand-600 hover:underline"
                  >
                    포트폴리오 보기 ↗
                  </a>
                )}
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                <form action={reviewMateApplication} className="flex flex-1 items-start gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="action" value="reject" />
                  <textarea
                    name="note"
                    rows={2}
                    placeholder="반려서 — 반려 사유를 적어주세요. 신청자에게 그대로 전달됩니다. (선택)"
                    className="w-full flex-1 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs placeholder:text-fg-quiet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
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
      )}

      {/* ---- 활동 중 ---- */}
      {active === 'active' && (
        <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
          {enriched.length === 0 && <EmptyState title="활동 중인 디베이트메이트가 없습니다" />}
          {enriched.map((m) => (
            <div key={m.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200"
                >
                  {(m.name[0] ?? '?').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium text-fg">
                    {m.name}
                    {m.inactiveDays >= INACTIVE_DAYS && (
                      <span className="rounded border border-hairline bg-paper px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                        {m.inactiveDays}일 무활동
                      </span>
                    )}
                    {m.warns.length > 0 && (
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                          m.warns.length >= 3
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        경고 {m.warns.length}회
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-[11px] text-fg-muted">
                    승인 {m.approvedAt ? m.approvedAt.toLocaleDateString('ko-KR') : '—'} · 출제 {m.drafts}건
                    {m.approvalRate != null && ` (승인률 ${m.approvalRate}%)`} · debateQ {m.sessions}회 · 포인트{' '}
                    {m.balance.toLocaleString()}P
                  </p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <WarnForm userId={m.id} name={m.name} />
                </div>
              </div>

              {m.warns.length >= 3 && (
                <div className="mt-2">
                  <Callout tone="warn" title="경고가 3회 이상 누적되었습니다">
                    최근 경고: {m.warns[0].summary}
                  </Callout>
                </div>
              )}

              <div className="mt-3">
                <RevokeForm userId={m.id} name={m.name} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- 처리 이력 ---- */}
      {active === 'history' && (
        <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
          {processed.length === 0 && <EmptyState title="처리한 신청이 아직 없습니다" />}
          {processed.map((m) => {
            const st = STATUS_BADGE[m.status] ?? STATUS_BADGE.rejected;
            return (
              <div key={m.id} className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${st.cls}`}>
                    {st.label}
                  </span>
                  <span className="font-medium text-fg">{maskName(m.user.name)}</span>
                  <span className="ml-auto font-mono text-[11px] text-fg-muted">
                    {m.reviewedAt?.toLocaleDateString('ko-KR')}
                  </span>
                </div>
                {m.reviewNote && (
                  <p className="mt-1.5 rounded-lg border border-hairline bg-paper/40 px-3 py-2 text-xs leading-relaxed text-fg-secondary">
                    {m.status === 'revoked' ? '회수 사유' : m.status === 'rejected' ? '반려서' : '메모'}: {m.reviewNote}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
