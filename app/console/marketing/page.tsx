import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canGrantRoles } from '@/app/lib/roles';
import { isEmailLive } from '@/app/lib/email';
import { countAudience, describeFilters, toFilters, type Audience } from '@/app/lib/marketing';
import { PageHeader, StatGrid } from '../ui';
import CampaignComposer from './campaign-composer';
import CampaignRow, { type CampaignRowData } from './campaign-row';

export const metadata: Metadata = { title: '홍보 메일' };

/** 실패 목록은 한 건당 이만큼만 그린다 — 진짜 수는 failedCount가 말한다 */
const FAILURES_SHOWN = 20;

export default async function ConsoleMarketingPage() {
  const user = await getUser();
  if (!canGrantRoles(user.role)) redirect('/console');

  const [all, members, guests, unsubscribed, campaigns, recent, sentTotal, failedTotal] =
    await Promise.all([
    countAudience('all'),
    countAudience('members'),
    countAudience('guests'),
    prisma.marketingContact.count({ where: { unsubscribedAt: { not: null } } }),
    prisma.emailCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.marketingContact.findMany({
      where: { unsubscribedAt: null },
      orderBy: { consentedAt: 'desc' },
      take: 8,
      select: { id: true, email: true, name: true, source: true, consentedAt: true, userId: true },
    }),
    // 지금까지 실제로 도착한 통수 — 캠페인 행의 sentCount 합이 아니라 발송 기록에서 센다
    prisma.emailDelivery.count({ where: { status: 'sent' } }),
    // 아직 남아 있는 실패 — 다시 보낼 수 있는 것이 얼마나 밀려 있는지
    prisma.emailDelivery.count({ where: { status: 'failed' } }),
  ]);

  /* ---------- 발송 결과 ----------
   * 수는 groupBy로 정확히 세고, 목록만 상한을 둔다. 상한 걸린 목록의 길이를
   * 지표로 쓰면 "실패 20건"이 실제로는 20이 아니라 화면 한도가 된다. */
  const campaignIds = campaigns.map((c) => c.id);
  const [deliveryCounts, failureRows] = await Promise.all([
    campaignIds.length
      ? prisma.emailDelivery.groupBy({
          by: ['campaignId', 'status'],
          where: { campaignId: { in: campaignIds } },
          _count: { _all: true },
        })
      : [],
    campaignIds.length
      ? prisma.emailDelivery.findMany({
          where: { campaignId: { in: campaignIds }, status: 'failed' },
          orderBy: { createdAt: 'desc' },
          select: { campaignId: true, email: true, status: true, error: true, attempt: true },
        })
      : [],
  ]);

  const tally = new Map<string, { sent: number; failed: number }>();
  for (const row of deliveryCounts) {
    const e = tally.get(row.campaignId) ?? { sent: 0, failed: 0 };
    if (row.status === 'sent') e.sent += row._count._all;
    else e.failed += row._count._all;
    tally.set(row.campaignId, e);
  }

  const failuresByCampaign = new Map<string, typeof failureRows>();
  for (const row of failureRows) {
    const list = failuresByCampaign.get(row.campaignId) ?? [];
    if (list.length < FAILURES_SHOWN) list.push(row);
    failuresByCampaign.set(row.campaignId, list);
  }

  const rows: CampaignRowData[] = campaigns.map((c) => {
    const counted = tally.get(c.id);
    return {
      id: c.id,
      subject: c.subject,
      status: c.status,
      // 저장할 때의 조건을 그대로 되살려 보여 준다 — 무슨 조건으로 갔는지 답할 수 있게
      audienceLabel: describeFilters(
        toFilters({
          audience: c.audience,
          source: c.sourceFilter,
          consentedWithinDays: c.consentedWithinDays,
          excludeSentWithinDays: c.excludeSentWithinDays,
        }),
      ),
      recipientCount: c.recipientCount,
      // 발송 기록이 있으면 그쪽이 진짜다. 캠페인 행의 합계는 요약일 뿐이다.
      sentCount: counted?.sent ?? c.sentCount,
      failedCount: counted?.failed ?? c.failedCount,
      errorMessage: c.errorMessage,
      createdAt: c.createdAt.toISOString(),
      sentAt: c.sentAt ? c.sentAt.toISOString() : null,
      failures: (failuresByCampaign.get(c.id) ?? []).map((d) => ({
        email: d.email,
        status: d.status,
        error: d.error,
        attempt: d.attempt,
      })),
    };
  });

  const counts: Record<Audience, number> = { all, members, guests };
  const live = isEmailLive();

  return (
    <>
      <PageHeader
        eyebrow="Marketing"
        title="홍보 메일"
        sub="광고성 정보 수신에 동의한 분들에게만 발송합니다. 모든 메일에는 수신거부 링크가 자동으로 붙습니다."
      />

      {!live && (
        <p className="mb-5 rounded-[var(--radius-panel)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          메일 전송 수단(<code className="font-mono">SMTP_HOST</code> · <code className="font-mono">SMTP_USER</code> ·{' '}
          <code className="font-mono">SMTP_PASS</code>)이 설정되지 않았습니다. 지금은 대상 수만 확인되고 실제로 메일이
          나가지 않습니다.
        </p>
      )}

      <StatGrid
        stats={[
          {
            label: '수신 동의',
            value: all,
            sub: `회원 ${members.toLocaleString()} · 비회원 ${guests.toLocaleString()}`,
          },
          { label: '수신거부', value: unsubscribed },
          { label: '지금까지 발송', value: sentTotal },
          { label: '남은 실패', value: failedTotal, warn: failedTotal > 0 },
        ]}
      />

      {/* ---------- 작성 ---------- */}
      <section className="mt-8" aria-labelledby="compose-title">
        <h2 id="compose-title" className="mb-4 text-lg font-bold text-fg">
          새 메일 작성
        </h2>
        <CampaignComposer counts={counts} />
      </section>

      {/* ---------- 발송 목록 ---------- */}
      <section className="mt-10" aria-labelledby="campaigns-title">
        <h2 id="campaigns-title" className="mb-3 text-lg font-bold text-fg">
          발송 목록
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-[var(--radius-panel)] border border-dashed border-hairline px-4 py-12 text-center text-sm text-fg-muted">
            아직 작성한 메일이 없습니다. 위에서 초안을 저장하면 여기에 쌓입니다.
          </p>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
            {rows.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} />
            ))}
          </ul>
        )}
      </section>

      {/* ---------- 최근 동의자 ---------- */}
      <section className="mt-10" aria-labelledby="contacts-title">
        <h2 id="contacts-title" className="mb-3 text-lg font-bold text-fg">
          최근 수신 동의
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-[var(--radius-panel)] border border-dashed border-hairline px-4 py-12 text-center text-sm text-fg-muted">
            아직 수신 동의자가 없습니다.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
            {recent.map((contact) => (
              <li key={contact.id} className="flex items-center gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0">
                <span data-no-translate className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">
                  {contact.email}
                </span>
                <span className="shrink-0 rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                  {contact.userId ? '회원' : '비회원'}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-fg-quiet">
                  {contact.consentedAt.toLocaleDateString('ko-KR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
