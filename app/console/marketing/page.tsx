import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canGrantRoles } from '@/app/lib/roles';
import { isEmailLive } from '@/app/lib/email';
import { AUDIENCE_LABELS, countAudience, type Audience } from '@/app/lib/marketing';
import { deleteCampaign } from '@/app/lib/actions/admin-marketing';
import { PageHeader, StatGrid } from '../ui';
import CampaignComposer from './campaign-composer';
import SendButton from './send-button';

export const metadata: Metadata = { title: '홍보 메일' };

const STATUS_LABELS: Record<string, string> = {
  draft: '초안',
  sending: '발송 중',
  sent: '발송 완료',
  failed: '발송 실패',
};

const STATUS_TONES: Record<string, string> = {
  draft: 'border-ink/15 bg-paper text-fg-secondary',
  sending: 'border-sky-200 bg-sky-50 text-sky-700',
  sent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
};

export default async function ConsoleMarketingPage() {
  const user = await getUser();
  if (!canGrantRoles(user.role)) redirect('/console');

  const [all, members, guests, unsubscribed, campaigns, recent] = await Promise.all([
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
  ]);

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
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          메일 전송 수단(<code className="font-mono">SMTP_HOST</code> · <code className="font-mono">SMTP_USER</code> ·{' '}
          <code className="font-mono">SMTP_PASS</code>)이 설정되지 않았습니다. 지금은 대상 수만 확인되고 실제로 메일이
          나가지 않습니다.
        </p>
      )}

      <StatGrid
        stats={[
          { label: '수신 동의', value: all },
          { label: '회원', value: members },
          { label: '비회원', value: guests },
          { label: '수신거부', value: unsubscribed },
        ]}
      />

      {/* ---------- 작성 ---------- */}
      <section className="mt-8" aria-labelledby="compose-title">
        <h2 id="compose-title" className="mb-4 text-lg font-bold text-ink">
          새 메일 작성
        </h2>
        <CampaignComposer counts={counts} />
      </section>

      {/* ---------- 발송 목록 ---------- */}
      <section className="mt-10" aria-labelledby="campaigns-title">
        <h2 id="campaigns-title" className="mb-3 text-lg font-bold text-ink">
          발송 목록
        </h2>
        {campaigns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink/15 px-4 py-12 text-center text-sm text-fg-muted">
            아직 작성한 메일이 없습니다.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-hairline bg-white">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{campaign.subject}</p>
                  <p className="font-mono text-[11px] text-fg-muted">
                    {AUDIENCE_LABELS[(campaign.audience as Audience) ?? 'all']} · 대상{' '}
                    {campaign.recipientCount.toLocaleString()}명
                    {campaign.status === 'sent' && ` · 성공 ${campaign.sentCount.toLocaleString()}`}
                    {campaign.failedCount > 0 && ` · 실패 ${campaign.failedCount.toLocaleString()}`}
                    {' · '}
                    {campaign.createdAt.toLocaleDateString('ko-KR')}
                  </p>
                  {campaign.errorMessage && (
                    <p className="mt-1 text-[11px] text-amber-700">{campaign.errorMessage}</p>
                  )}
                </div>

                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    STATUS_TONES[campaign.status] ?? STATUS_TONES.draft
                  }`}
                >
                  {STATUS_LABELS[campaign.status] ?? campaign.status}
                </span>

                {(campaign.status === 'draft' || campaign.status === 'failed') && (
                  <div className="flex shrink-0 items-center gap-2">
                    <SendButton
                      campaignId={campaign.id}
                      subject={campaign.subject}
                      recipientCount={campaign.recipientCount}
                    />
                    <form action={deleteCampaign}>
                      <input type="hidden" name="id" value={campaign.id} />
                      <button className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:border-rose-300 hover:text-rose-600">
                        삭제
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- 최근 동의자 ---------- */}
      <section className="mt-10" aria-labelledby="contacts-title">
        <h2 id="contacts-title" className="mb-3 text-lg font-bold text-ink">
          최근 수신 동의
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink/15 px-4 py-12 text-center text-sm text-fg-muted">
            아직 수신 동의자가 없습니다.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-hairline bg-white">
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
