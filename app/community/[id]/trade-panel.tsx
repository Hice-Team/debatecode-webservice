'use client';

// 중고 매물 거래 패널 — 글 본문 위에 붙는다.
//
// 중고글에서 사람들이 실제로 확인하는 것은 본문이 아니라 가격·상태·거래 방법 셋이다.
// 그래서 본문보다 위에 두고, 스크롤하지 않아도 판단할 수 있게 한 덩어리로 묶는다.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setListingStatus, startChat } from '@/app/lib/actions/market';
import {
  CONDITION_LABELS,
  LISTING_STATUSES,
  LISTING_STATUS_META,
  THECHEAT_URL,
  formatPrice,
  shouldWarnFraud,
  type Condition,
  type ListingStatus,
} from '@/app/lib/market';

export interface TradeListing {
  id: string;
  price: number;
  status: string;
  condition: string;
  conditionNote: string | null;
  region: string | null;
  shipping: boolean;
  shippingFee: number | null;
  sellerVerified: boolean;
}

export default function TradePanel({
  listing,
  isSeller,
  canTrade,
  tradeBlockedReason,
}: {
  listing: TradeListing;
  isSeller: boolean;
  /** 거래를 시작할 수 있는가 — 로그인 + 이메일 인증 */
  canTrade: boolean;
  tradeBlockedReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const status = (LISTING_STATUSES as readonly string[]).includes(listing.status)
    ? (listing.status as ListingStatus)
    : 'selling';
  const meta = LISTING_STATUS_META[status];
  const condition = CONDITION_LABELS[listing.condition as Condition] ?? listing.condition;

  function changeStatus(next: ListingStatus) {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('listingId', listing.id);
      form.set('status', next);
      const result = await setListingStatus(form);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function openChat() {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('listingId', listing.id);
      const result = await startChat(form);
      if (result.error) setError(result.error);
      else if (result.chatId) router.push(`/dashboard/market?chat=${result.chatId}`);
    });
  }

  return (
    <section
      aria-label="거래 정보"
      className="mb-6 rounded-[var(--radius-panel)] border border-hairline bg-white p-5"
    >
      {/* 가격 · 상태 */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="dc-num font-display text-3xl font-bold tracking-tight text-fg">
          {formatPrice(listing.price)}
        </p>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${meta.tone}`}>
          {meta.label}
        </span>
        {listing.sellerVerified && (
          <span className="shrink-0 rounded-full border border-hairline bg-paper px-2.5 py-0.5 font-mono text-[11px] text-fg-muted">
            이메일 인증 판매자
          </span>
        )}
      </div>

      {/* 거래 조건 */}
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="shrink-0 text-fg-muted">상태</dt>
          <dd className="min-w-0 text-fg-secondary">
            {condition}
            {listing.conditionNote && <span className="text-fg-muted"> · {listing.conditionNote}</span>}
          </dd>
        </div>
        {listing.region && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-fg-muted">직거래</dt>
            <dd className="min-w-0 text-fg-secondary">{listing.region}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="shrink-0 text-fg-muted">택배</dt>
          <dd className="min-w-0 text-fg-secondary">
            {listing.shipping
              ? listing.shippingFee === null
                ? '가능 (착불 또는 협의)'
                : `가능 · ${formatPrice(listing.shippingFee)}`
              : '불가 (직거래만)'}
          </dd>
        </div>
      </dl>

      {/* 행동 — 판매자는 상태 전환, 구매자는 대화 시작 */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {isSeller ? (
          LISTING_STATUSES.map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => changeStatus(next)}
              disabled={pending || next === status}
              aria-pressed={next === status}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                next === status
                  ? 'border-signal bg-signal/10 text-signal'
                  : 'border-hairline text-fg-secondary hover:border-ink/25'
              }`}
            >
              {LISTING_STATUS_META[next].label}
            </button>
          ))
        ) : (
          <button
            type="button"
            onClick={openChat}
            disabled={pending || !canTrade || status === 'sold'}
            className="rounded-full bg-signal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
          >
            {status === 'sold' ? '판매가 끝난 매물입니다' : pending ? '여는 중…' : '거래하기'}
          </button>
        )}

        {/* 사기 조회 — 우리가 대신 조회하지 않는다. 이용자가 받은 계좌·연락처를 직접 넣는다. */}
        <a
          href={THECHEAT_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-full border border-hairline px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:border-rose-300 hover:text-rose-700"
        >
          더치트 사기조회 ↗
        </a>
      </div>

      {!isSeller && !canTrade && tradeBlockedReason && (
        <p className="mt-3 text-[12px] leading-relaxed text-amber-800">{tradeBlockedReason}</p>
      )}

      {shouldWarnFraud(listing.shipping) && (
        <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">
          택배 거래는 먼저 보낸 쪽이 위험을 집니다. 입금 전에 상대의 계좌번호와 연락처를 더치트에서
          조회하고, 가능하면 안전결제를 이용하세요.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[12px] text-rose-600">
          {error}
        </p>
      )}
    </section>
  );
}
