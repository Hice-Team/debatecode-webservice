import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { getPointSummary, POINT_KIND_LABELS } from '@/app/lib/points';
import { DIFFICULTY_LABELS } from '@/app/lib/types';
import { platformLabel } from '@/app/community/boards';
import SnsPromoForm from './sns-promo-form';
import ShopSection from './shop-section';

export const metadata: Metadata = { title: '디베이트메이트 활동 콘솔' };

const CARD = 'rounded-2xl border border-ink/10 bg-white';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-600 border-rose-200',
    requested: 'bg-sky-50 text-sky-700 border-sky-200',
    fulfilled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    canceled: 'bg-ink/[0.05] text-ink-soft/50 border-ink/10',
    failed: 'bg-rose-50 text-rose-600 border-rose-200',
  };
  const labels: Record<string, string> = {
    pending: '심사 중',
    approved: '승인',
    rejected: '반려',
    requested: '발급 대기',
    fulfilled: '발급 완료',
    canceled: '취소됨',
    failed: '발급 실패',
  };
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${styles[status] ?? styles.canceled}`}>
      {labels[status] ?? status}
    </span>
  );
}

// 디베이트메이트 활동 콘솔 — 출제·검토 현황, 포인트 현황/내역, SNS 인증 신청, 디베이트샵.
export default async function MateConsolePage() {
  const user = await getUser();
  // 메이트와 관리자만 — 그 외에는 소개 페이지로 돌려보낸다
  if (user.role !== 'debate_mate' && user.role !== 'admin') redirect('/debate-mate');

  const [summary, drafts, ledger, requests, orders, products, snsPosts, debateQCount] = await Promise.all([
    getPointSummary(user.id),
    prisma.problemDraft.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, difficulty: true, category: true, status: true, reviewNote: true, createdAt: true },
    }),
    prisma.pointLedger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.pointRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.shopOrder.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { product: { select: { name: true, brand: true } } },
    }),
    prisma.shopProduct.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { priceKrw: 'asc' }] }),
    // SNS 인증 신청 대상 — 본인이 SNS 게시판에 올린 외부 링크 글
    prisma.post.findMany({
      where: { authorId: user.id, board: 'sns', url: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, title: true, url: true, snsPlatform: true, createdAt: true },
    }),
    prisma.debateQSession.count({ where: { userId: user.id, status: 'COMPLETED' } }),
  ]);

  const approvedDrafts = drafts.filter((d) => d.status === 'approved').length;
  const pendingDrafts = drafts.filter((d) => d.status === 'pending').length;

  // 이미 신청했거나 승인된 SNS 글은 목록에서 제외한다
  const usedPostIds = new Set(
    requests
      .filter((r) => r.kind === 'sns_promo' && r.status !== 'rejected')
      .map((r) => (r.payload as { postId?: string })?.postId)
      .filter(Boolean) as string[],
  );
  const selectablePosts = snsPosts.filter((p) => !usedPostIds.has(p.id));

  return (
    <PageShell width="5xl">
      <PageHeader
        slug="mate-console"
        title="디베이트메이트 활동 콘솔"
        desc="출제·검토 현황과 디베이트포인트를 한곳에서 관리합니다."
        actions={
          <Link
            href="/problems/new"
            className="inline-flex items-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98]"
          >
            + 문제 만들기
          </Link>
        }
      />

      {/* 포인트 현황 */}
      <section className={`${CARD} mb-6 overflow-hidden`} aria-labelledby="points-title">
        <div className="border-b border-ink/[0.07] px-5 py-3">
          <h2 id="points-title" className="font-bold text-ink">디베이트포인트 현황</h2>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-ink/[0.07] sm:grid-cols-4 sm:divide-y-0">
          {[
            { label: '현재 포인트', value: summary.balance, tone: 'text-signal', hint: `${summary.balance.toLocaleString()}원 상당` },
            { label: '적립 예정', value: summary.pending, tone: 'text-amber-600', hint: '승인 대기 중' },
            { label: '사용 예정', value: summary.reserved, tone: 'text-sky-700', hint: '발급 대기 주문' },
            { label: '누적 적립', value: summary.totalEarned, tone: 'text-ink', hint: `누적 사용 ${summary.totalSpent.toLocaleString()}P` },
          ].map((stat) => (
            <div key={stat.label} className="px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-soft/40">{stat.label}</p>
              <p className={`mt-1 font-display text-2xl font-bold ${stat.tone}`}>
                {stat.value.toLocaleString()}
                <span className="ml-0.5 text-sm font-semibold text-ink-soft/35">P</span>
              </p>
              <p className="mt-0.5 text-[11px] text-ink-soft/45">{stat.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 활동 요약 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '출제한 문제', value: drafts.length },
          { label: '승인됨', value: approvedDrafts },
          { label: '검토 대기', value: pendingDrafts, warn: pendingDrafts > 0 },
          { label: 'debateQ 완료', value: debateQCount },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-ink/10 bg-white px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-soft/40">{stat.label}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${stat.warn ? 'text-amber-600' : 'text-ink'}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 내가 만든 문제 + 검토 현황 */}
        <section className={`${CARD} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-ink/[0.07] px-5 py-3">
            <h2 className="font-bold text-ink">내가 만든 문제</h2>
            <Link href="/console/drafts" className="font-mono text-[11px] text-brand-600 hover:underline">
              초안 관리 →
            </Link>
          </div>
          {drafts.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-soft/45">
              아직 출제한 문제가 없습니다. 위의 <span className="font-semibold text-signal">문제 만들기</span>로 시작해 보세요.
            </p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {drafts.slice(0, 8).map((draft) => (
                <li key={draft.id} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{draft.title}</span>
                    <StatusBadge status={draft.status} />
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-soft/40">
                    {draft.category} · {DIFFICULTY_LABELS[draft.difficulty] ?? ''} ·{' '}
                    {new Date(draft.createdAt).toLocaleDateString('ko-KR')}
                  </p>
                  {draft.status === 'rejected' && draft.reviewNote && (
                    <p className="mt-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">{draft.reviewNote}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 포인트 적립 내역 */}
        <section className={`${CARD} overflow-hidden`}>
          <div className="border-b border-ink/[0.07] px-5 py-3">
            <h2 className="font-bold text-ink">포인트 내역</h2>
          </div>
          {ledger.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-soft/45">아직 적립 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {ledger.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-12 shrink-0 font-mono text-[11px] text-ink-soft/40">
                    {new Date(entry.createdAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft/75">
                    {entry.memo ?? POINT_KIND_LABELS[entry.kind] ?? entry.kind}
                  </span>
                  <span className={`shrink-0 font-mono text-sm font-semibold ${entry.amount > 0 ? 'text-emerald-600' : 'text-ink-soft/60'}`}>
                    {entry.amount > 0 ? '+' : ''}
                    {entry.amount.toLocaleString()}P
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* SNS 홍보 인증 신청 */}
      <section className={`${CARD} mt-6 overflow-hidden`}>
        <div className="border-b border-ink/[0.07] px-5 py-3">
          <h2 className="font-bold text-ink">SNS 홍보 활동 인증</h2>
          <p className="mt-0.5 text-xs text-ink-soft/55">
            SNS 게시판에 올린 홍보 글을 골라 신청하면 운영진 검토 후 포인트가 지급됩니다.
          </p>
        </div>
        <div className="p-5">
          <SnsPromoForm
            posts={selectablePosts.map((p) => ({
              id: p.id,
              title: p.title,
              url: p.url!,
              platform: platformLabel(p.snsPlatform),
            }))}
          />
        </div>

        {requests.length > 0 && (
          <ul className="divide-y divide-ink/5 border-t border-ink/[0.07]">
            {requests.map((request) => {
              const payload = request.payload as { title?: string; platform?: string };
              return (
                <li key={request.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-soft/80">{payload?.title ?? 'SNS 홍보'}</span>
                    <span className="font-mono text-[11px] text-ink-soft/40">
                      {platformLabel(payload?.platform)} · {new Date(request.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                    {request.status === 'rejected' && request.reviewNote && (
                      <span className="mt-1 block rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">{request.reviewNote}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-ink-soft/50">+{request.amount}P</span>
                  <StatusBadge status={request.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 디베이트샵 */}
      <ShopSection productCount={products.length} orders={orders} balance={summary.balance} />
    </PageShell>
  );
}
