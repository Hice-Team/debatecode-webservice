import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { getPointSummary, POINT_KIND_LABELS } from '@/app/lib/points';
import { RANK_BADGE, nextRankFor, rankForScore, type RankName } from '@/app/lib/star-score';
import { DIFFICULTY_LABELS } from '@/app/lib/types';
import { platformLabel } from '@/app/community/boards';
import SnsPromoForm from './sns-promo-form';

export const metadata: Metadata = { title: '디베이트메이트 활동 콘솔' };

const CARD = 'rounded-[var(--radius-panel)] border border-hairline bg-surface';

function StatusBadge({ status }: { status: string }) {
  // 상점이 사라져 주문 상태(발급 대기·완료·실패)는 더 이상 쓰이지 않는다.
  // 남은 것은 출제 초안과 활동 인증의 심사 상태뿐이다.
  const styles: Record<string, string> = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rejected: 'border-rose-200 bg-rose-50 text-rose-600',
  };
  const labels: Record<string, string> = { pending: '심사 중', approved: '승인', rejected: '반려' };
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        styles[status] ?? 'border-hairline bg-paper text-fg-muted'
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

// 디베이트메이트 활동 콘솔 — 출제·검토 현황, 포인트와 등급, SNS 활동 인증.
export default async function MateConsolePage() {
  const user = await getUser();
  // 메이트와 관리자만 — 그 외에는 소개 페이지로 돌려보낸다
  if (user.role !== 'debate_mate' && user.role !== 'admin') redirect('/debate-mate');

  const [summary, drafts, ledger, requests, snsPosts, debateQCount] = await Promise.all([
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
    // SNS 인증 신청 대상 — 본인이 SNS 게시판에 올린 외부 링크 글
    prisma.post.findMany({
      where: { authorId: user.id, board: 'sns', url: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, title: true, url: true, snsPlatform: true, createdAt: true },
    }),
    prisma.debateQSession.count({ where: { userId: user.id, status: 'COMPLETED' } }),
  ]);

  // 포인트가 곧 등급 점수다(app/lib/points.ts). 메이트에게 포인트는 이제 교환 수단이
  // 아니라 등급으로 이어지는 값이라, 잔액 옆에 그 등급을 함께 보여 준다.
  const rank = rankForScore(summary.balance);
  const nextRank = nextRankFor(summary.balance);

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
            className="inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            + 문제 만들기
          </Link>
        }
      />

      {/* 활동과 포인트를 한 카드로 묶는다.
          예전에는 위아래 두 줄(포인트 4칸 + 활동 4칸)이었는데, 여덟 칸이 같은 무게로
          늘어서 있으면 무엇을 먼저 봐야 하는지가 사라진다.
          왼쪽은 "내가 한 일", 오른쪽은 "그래서 얼마" — 성격이 다른 둘을 나눠 둔다. */}
      <section className={`${CARD} mb-6 overflow-hidden`} aria-labelledby="summary-title">
        <div className="border-b border-hairline px-5 py-3">
          <h2 id="summary-title" className="font-bold text-fg">내 활동과 포인트</h2>
        </div>
        <div className="grid lg:grid-cols-[1.3fr_1fr] lg:divide-x lg:divide-hairline">
          {/* 내 출제 활동 */}
          <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: '출제한 문제', value: drafts.length, tone: 'text-fg' },
              { label: '승인됨', value: approvedDrafts, tone: 'text-emerald-700' },
              { label: '검토 대기', value: pendingDrafts, tone: pendingDrafts > 0 ? 'text-amber-700' : 'text-fg' },
              { label: 'debateQ 완료', value: debateQCount, tone: 'text-fg' },
            ].map((stat) => (
              <div key={stat.label} className="px-4 py-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">{stat.label}</p>
                <p className={`dc-num mt-1 font-display text-2xl font-bold ${stat.tone}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* 포인트와 등급 — 예전에는 잔액 아래에 "○○원 상당"이라고 적었다.
              교환할 상점이 없어진 지금 그건 없는 값을 지어낸 것이다(DESIGN.md §5).
              대신 그 포인트가 실제로 무엇이 되는지 — 등급 — 를 적는다. */}
          <div className="grid grid-cols-2 divide-x divide-hairline border-t border-hairline lg:border-t-0">
            <div className="px-4 py-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">보유 포인트</p>
              <p className="dc-num mt-1 font-display text-2xl font-bold text-signal">
                {summary.balance.toLocaleString()}
                <span className="ml-0.5 text-sm font-semibold text-fg-quiet">P</span>
              </p>
              <p className="mt-1 flex items-center gap-1.5">
                <span
                  className={`rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    RANK_BADGE[rank.name as RankName]
                  }`}
                >
                  {rank.name}
                </span>
                <span className="text-[11px] text-fg-muted">
                  {nextRank ? `${nextRank.name}까지 ${(nextRank.min - summary.balance).toLocaleString()}P` : '최고 등급'}
                </span>
              </p>
            </div>
            <div className="px-4 py-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">적립 예정</p>
              <p className="dc-num mt-1 font-display text-2xl font-bold text-amber-700">
                {summary.pending.toLocaleString()}
                <span className="ml-0.5 text-sm font-semibold text-fg-quiet">P</span>
              </p>
              <p className="mt-1 text-[11px] text-fg-muted">
                {summary.pending > 0 ? '운영진 승인 후 지급됩니다.' : '심사 중인 신청이 없습니다.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 내가 만든 문제 + 검토 현황 */}
        <section className={`${CARD} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
            <h2 className="font-bold text-fg">내가 만든 문제</h2>
            <Link href="/console/drafts" className="font-mono text-[11px] text-signal hover:underline">
              초안 관리 →
            </Link>
          </div>
          {drafts.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-fg-muted">
              아직 출제한 문제가 없습니다. 위의 <span className="font-semibold text-signal">문제 만들기</span>로 시작해 보세요.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {drafts.slice(0, 8).map((draft) => (
                <li key={draft.id} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-fg">{draft.title}</span>
                    <StatusBadge status={draft.status} />
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-fg-quiet">
                    {draft.category} · {DIFFICULTY_LABELS[draft.difficulty] ?? ''} ·{' '}
                    {new Date(draft.createdAt).toLocaleDateString('ko-KR')}
                  </p>
                  {draft.status === 'rejected' && draft.reviewNote && (
                    <p className="mt-1 rounded-[var(--radius-card)] bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">{draft.reviewNote}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 포인트 적립 내역 */}
        <section className={`${CARD} overflow-hidden`}>
          <div className="border-b border-hairline px-5 py-3">
            <h2 className="font-bold text-fg">포인트 내역</h2>
          </div>
          {ledger.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-fg-muted">아직 적립 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {ledger.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-12 shrink-0 font-mono text-[11px] text-fg-quiet">
                    {new Date(entry.createdAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {entry.memo ?? POINT_KIND_LABELS[entry.kind] ?? entry.kind}
                  </span>
                  <span className={`shrink-0 font-mono text-sm font-semibold ${entry.amount > 0 ? 'text-emerald-600' : 'text-fg-secondary'}`}>
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
        <div className="border-b border-hairline px-5 py-3">
          <h2 className="font-bold text-fg">SNS 홍보 활동 인증</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
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
          <ul className="divide-y divide-hairline border-t border-hairline">
            {requests.map((request) => {
              const payload = request.payload as { title?: string; platform?: string };
              return (
                <li key={request.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{payload?.title ?? 'SNS 홍보'}</span>
                    <span className="font-mono text-[11px] text-fg-quiet">
                      {platformLabel(payload?.platform)} · {new Date(request.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                    {request.status === 'rejected' && request.reviewNote && (
                      <span className="mt-1 block rounded-[var(--radius-card)] bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">{request.reviewNote}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-fg-muted">+{request.amount}P</span>
                  <StatusBadge status={request.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </PageShell>
  );
}
