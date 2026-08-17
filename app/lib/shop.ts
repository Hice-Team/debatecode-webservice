// 디베이트샵 공용 상수 — 클라이언트/서버가 같은 라벨을 본다.
// 주문 상태와 발급 채널은 화면 여러 곳(상점·주문내역·관리 콘솔)에서 쓰이므로 한곳에 둔다.

/** 주문 상태 — schema.prisma의 ShopOrder.status와 짝을 이룬다 */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  requested: '발급 대기',
  fulfilled: '발급 완료',
  canceled: '취소됨',
  failed: '발급 실패',
};

export const ORDER_STATUS_TONES: Record<string, string> = {
  requested: 'border-amber-200 bg-amber-50 text-amber-700',
  fulfilled: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  canceled: 'border-ink/15 bg-paper text-ink-soft/55',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
};

/** 쿠폰 발급 채널 */
export const SHOP_PROVIDERS = [
  { key: 'manual', label: '수동 발급', desc: '운영자가 쿠폰 코드를 직접 입력합니다' },
  { key: 'kakao_biz', label: '카카오쇼핑 for biz', desc: '연동 시 자동 발급' },
  { key: 'giftishow', label: '기프티쇼', desc: '연동 시 자동 발급' },
] as const;

export type ShopProviderKey = (typeof SHOP_PROVIDERS)[number]['key'];

export function providerLabel(key: string): string {
  return SHOP_PROVIDERS.find((p) => p.key === key)?.label ?? key;
}

/** 포인트와 원화는 1:1이다 — 문구가 갈리지 않도록 여기서만 정의한다 */
export const POINT_TO_KRW_NOTE = '1,000P = 1,000원';
