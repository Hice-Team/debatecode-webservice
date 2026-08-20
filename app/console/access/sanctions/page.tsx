import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { maskName } from '@/app/lib/privacy';
import { sanctionTypeLabel, APPEAL_STATUS_LABEL } from '@/app/lib/sanctions';
import { resolveAppeal } from '@/app/lib/actions/admin-access';
import LiftForm from './lift-form';
import {
  PageHeader,
  LinkTabs,
  StatGrid,
  Callout,
  EmptyState,
  SlaBadge,
  StatusBadge,
  BTN_APPROVE,
  BTN_REJECT,
} from '../../ui';

export const metadata: Metadata = { title: '제재 센터' };

type Tab = 'active' | 'appeals' | 'history';

interface Evidence {
  reportIds?: string[];
  note?: string | null;
  issuedByName?: string;
}

// 제재 센터 — 활성 제재, 이의제기, 이력을 한곳에서.
//
// 예전에는 제재가 회원 표의 한 칸에 배지로만 있어서, "지금 몇 명이 무슨 제재를 받고 있나",
// "이의제기가 들어왔나"를 알 방법이 없었다.
export default async function SanctionCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getUser();
  const [canIssue, canLift] = await Promise.all([can(user, 'sanction.issue'), can(user, 'sanction.lift')]);
  if (!canIssue && !canLift) redirect('/console');

  const { tab } = await searchParams;
  const active: Tab = tab === 'appeals' || tab === 'history' ? tab : 'active';

  const now = new Date();
  const userSelect = { select: { id: true, name: true, role: true } };

  const [liveList, appealList, historyList, counts] = await Promise.all([
    prisma.sanction.findMany({
      where: { active: true },
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100,
      include: { user: userSelect },
    }),
    prisma.sanction.findMany({
      where: { appealStatus: 'pending' },
      orderBy: { appealedAt: 'asc' },
      take: 50,
      include: { user: userSelect },
    }),
    prisma.sanction.findMany({
      where: { active: false },
      orderBy: { liftedAt: 'desc' },
      take: 50,
      include: { user: userSelect },
    }),
    Promise.all([
      prisma.sanction.count({ where: { active: true } }),
      prisma.sanction.count({ where: { appealStatus: 'pending' } }),
      prisma.sanction.count({ where: { active: true, expiresAt: null } }),
      prisma.sanction.count({
        where: { active: true, expiresAt: { gt: now, lt: new Date(now.getTime() + 3 * 86400_000) } },
      }),
    ]),
  ]);

  const [activeCount, appealCount, permanentCount, expiringCount] = counts;

  return (
    <div>
      <PageHeader
        eyebrow="SANCTION CENTER"
        title="제재 센터"
        sub="발급된 제재를 근거와 함께 봅니다. 새 제재는 회원 디렉터리나 신고 처리 화면에서 대상을 고른 뒤 발급합니다."
      />

      {appealCount > 0 && (
        <div className="mb-5">
          <Callout tone="warn" title={`이의제기 ${appealCount}건이 답변을 기다리고 있습니다`}>
            인정하면 제재가 함께 해제됩니다. 기각할 때도 사유를 남겨야 같은 문의가 반복되지 않습니다.
          </Callout>
        </div>
      )}

      <StatGrid
        stats={[
          { label: '활성 제재', value: activeCount, warn: activeCount > 0 },
          { label: '영구 제재', value: permanentCount },
          { label: '3일 내 만료', value: expiringCount },
          { label: '이의제기 대기', value: appealCount, warn: appealCount > 0 },
        ]}
      />

      <div className="mt-6">
        <LinkTabs
          items={[
            { href: '/console/access/sanctions?tab=active', label: '활성 제재', count: activeCount, active: active === 'active' },
            { href: '/console/access/sanctions?tab=appeals', label: '이의제기', count: appealCount, active: active === 'appeals' },
            { href: '/console/access/sanctions?tab=history', label: '해제 이력', active: active === 'history' },
          ]}
        />
      </div>

      {/* ---- 활성 제재 ---- */}
      {active === 'active' && (
        <div className="divide-y divide-ink/5 overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
          {liveList.length === 0 && (
            <EmptyState title="활성 제재가 없습니다" sub="현재 제한 중인 계정이 없습니다." />
          )}
          {liveList.map((s) => {
            const evidence = (s.evidence ?? {}) as Evidence;
            const expiring = s.expiresAt && s.expiresAt.getTime() - now.getTime() < 3 * 86400_000;
            return (
              <div key={s.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-700">
                    {sanctionTypeLabel(s.type)} 제한
                  </span>
                  <span className="font-medium text-ink">{maskName(s.user.name)}</span>
                  <span
                    className={`font-mono text-[11px] ${
                      !s.expiresAt ? 'font-semibold text-rose-600' : expiring ? 'text-amber-700' : 'text-fg-muted'
                    }`}
                  >
                    {s.expiresAt ? `~${s.expiresAt.toLocaleString('ko-KR')}` : '영구 (만료 없음)'}
                  </span>
                  {s.appealStatus && (
                    <StatusBadge
                      label={APPEAL_STATUS_LABEL[s.appealStatus] ?? s.appealStatus}
                      tone={s.appealStatus === 'pending' ? 'open' : 'muted'}
                    />
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    <SlaBadge since={s.createdAt} done />
                    {canLift && <LiftForm id={s.id} name={maskName(s.user.name)} />}
                  </span>
                </div>

                <p className="mt-2 text-sm text-fg">{s.reason}</p>

                {/* 근거 — 이의제기 때 이 블록 하나로 답이 나와야 한다 */}
                <div className="mt-2 rounded-xl border border-hairline bg-paper/40 px-3 py-2">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted">근거</p>
                  {evidence.reportIds && evidence.reportIds.length > 0 ? (
                    <p className="text-[11px] text-fg-secondary">
                      신고 {evidence.reportIds.length}건 ·{' '}
                      <a href="/console/reports?status=resolved" className="text-brand-600 hover:underline">
                        신고 처리 화면에서 보기
                      </a>
                    </p>
                  ) : evidence.note ? (
                    <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-fg-secondary">{evidence.note}</p>
                  ) : (
                    <p className="text-[11px] text-fg-quiet">
                      기록된 근거가 없습니다 (제재 센터 도입 전에 발급된 건일 수 있습니다).
                    </p>
                  )}
                  {evidence.issuedByName && (
                    <p className="mt-1 font-mono text-[10px] text-fg-quiet">발급 {evidence.issuedByName}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- 이의제기 ---- */}
      {active === 'appeals' && (
        <div className="divide-y divide-ink/5 overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
          {appealList.length === 0 && (
            <EmptyState
              title="처리할 이의제기가 없습니다"
              sub="이용자가 문의하기로 제출한 소명이 여기에 모입니다."
            />
          )}
          {appealList.map((s) => (
            <div key={s.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label="이의 접수" tone="open" />
                <span className="font-medium text-ink">{maskName(s.user.name)}</span>
                <span className="font-mono text-[11px] text-fg-muted">
                  {sanctionTypeLabel(s.type)} 제한 · {s.expiresAt ? `~${s.expiresAt.toLocaleDateString('ko-KR')}` : '영구'}
                </span>
                {s.appealedAt && <SlaBadge since={s.appealedAt} />}
              </div>

              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                <div className="rounded-xl border border-hairline bg-paper/40 px-3 py-2">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted">제재 사유</p>
                  <p className="text-xs leading-relaxed text-fg">{s.reason}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-amber-800/60">이용자 소명</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-fg">{s.appealText}</p>
                </div>
              </div>

              {canLift && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                  <form action={resolveAppeal} className="flex flex-1 items-start gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="action" value="reject" />
                    <input
                      name="note"
                      placeholder="기각 사유 — 이용자에게 전달됩니다"
                      className="w-full flex-1 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs placeholder:text-fg-quiet"
                    />
                    <button className={BTN_REJECT}>기각</button>
                  </form>
                  <form action={resolveAppeal}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="action" value="accept" />
                    <button className={BTN_APPROVE}>인정 · 제재 해제</button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---- 해제 이력 ---- */}
      {active === 'history' && (
        <div className="divide-y divide-ink/5 overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
          {historyList.length === 0 && <EmptyState title="해제된 제재가 없습니다" />}
          {historyList.map((s) => (
            <div key={s.id} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label="해제됨" tone="done" />
                <span className="font-medium text-ink">{maskName(s.user.name)}</span>
                <span className="font-mono text-[11px] text-fg-muted">{sanctionTypeLabel(s.type)} 제한</span>
                <span className="ml-auto font-mono text-[11px] text-fg-quiet">
                  {s.liftedAt ? s.liftedAt.toLocaleString('ko-KR') : '만료'}
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-secondary">
                원 사유: {s.reason}
                {s.liftReason && <span className="text-emerald-700"> · 해제: {s.liftReason}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
