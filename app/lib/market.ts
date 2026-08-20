// 중고 거래 정책 — 상태·상품등급·사기조회.
//
// 순수 카탈로그다(DB를 건드리지 않는다). 클라이언트 컴포넌트에서도 import한다 —
// permissions.ts / board-rules.ts와 같은 규칙.

/* ---------- 거래 상태 ---------- */

export const LISTING_STATUSES = ['selling', 'reserved', 'sold'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export function isListingStatus(value: unknown): value is ListingStatus {
  return typeof value === 'string' && (LISTING_STATUSES as readonly string[]).includes(value);
}

export const LISTING_STATUS_META: Record<ListingStatus, { label: string; tone: string }> = {
  selling: { label: '판매중', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  reserved: { label: '예약중', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  sold: { label: '판매완료', tone: 'border-hairline bg-paper text-fg-muted' },
};

/* ---------- 상품 상태 ---------- */

export const CONDITIONS = ['new', 'like_new', 'used', 'worn'] as const;
export type Condition = (typeof CONDITIONS)[number];

export function isCondition(value: unknown): value is Condition {
  return typeof value === 'string' && (CONDITIONS as readonly string[]).includes(value);
}

export const CONDITION_LABELS: Record<Condition, string> = {
  new: '미개봉',
  like_new: '거의 새것',
  used: '사용감 있음',
  worn: '하자 있음',
};

/* ---------- 금액 ---------- */

/** 값이 크면 실수로 0을 더 붙인 것이다 — 1억을 상한으로 둔다. */
export const MAX_PRICE = 100_000_000;
export const MAX_SHIPPING_FEE = 100_000;

export function formatPrice(won: number): string {
  return won === 0 ? '나눔' : `${won.toLocaleString('ko-KR')}원`;
}

/** 폼에서 온 값을 원 단위 정수로. 쉼표·"원"이 섞여 와도 받는다. */
export function parsePrice(raw: unknown, max = MAX_PRICE): number | null {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

/* ---------- 사기 조회 (더치트) ---------- */

/**
 * 더치트 사기 조회 링크.
 *
 * API 연동이 아니라 딥링크로 둔 이유가 있다. 더치트는 공개 API를 제공하지 않고, 기업 제휴는
 * 계약과 비용이 따른다. 무엇보다 API로 붙이면 거래 상대의 계좌번호·연락처가 **우리 서버를
 * 거쳐** 제3자에게 전달되는 구조가 되어, 개인정보 처리 위탁 고지 대상이 하나 늘어난다.
 * 이용자가 직접 더치트에서 조회하게 하면 같은 효과를 내면서 그 부담이 없다.
 *
 * 조회할 값(계좌·연락처)은 이용자가 채팅에서 받은 것을 직접 넣는다 — 우리가 수집하지 않는다.
 */
export const THECHEAT_URL = 'https://thecheat.co.kr/rb/?mod=_search';

/** 사기 조회를 권해야 하는 거래인가 — 택배 거래는 선입금 위험이 있다. */
export function shouldWarnFraud(shipping: boolean): boolean {
  return shipping;
}

/* ---------- 거래 자격 ---------- */

export interface TradeEligibility {
  allowed: boolean;
  reason?: 'login-required' | 'email-unverified';
  message?: string;
}

/**
 * 중고 거래(글쓰기·채팅 시작)를 할 수 있는가.
 *
 * 이메일 인증을 요구하는 이유: 중고 거래는 이 서비스에서 유일하게 **금전이 오가는** 자리다.
 * 문제가 생겼을 때 연락이 닿지 않는 계정이면 상대가 기댈 곳이 없다. 다른 게시판에는
 * 이 제한을 걸지 않는다(가입 자체는 이메일 인증 없이 가능하다).
 */
export function canTrade(viewer: { userId: string | null; emailVerified: boolean }): TradeEligibility {
  if (!viewer.userId) {
    return { allowed: false, reason: 'login-required', message: '거래하려면 로그인이 필요합니다.' };
  }
  if (!viewer.emailVerified) {
    return {
      allowed: false,
      reason: 'email-unverified',
      message: '중고 거래는 이메일 인증을 마친 계정만 이용할 수 있습니다. 설정 › 계정에서 인증해 주세요.',
    };
  }
  return { allowed: true };
}
