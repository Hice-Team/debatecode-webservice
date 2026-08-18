// 상점 구분 — 일반 상점과 디베이트메이트 전용 상점.
//
// 카탈로그만 다르고 흐름은 같다: 포인트 차감 → 운영자 승인 → 입력한 연락처로 발송.
// 두 상점을 별도 기능으로 만들지 않은 이유가 이것이다. 다르게 만들면 환불·발급 로직이
// 두 벌이 되고, 한쪽만 고쳐지는 사고가 난다.

export const SHOP_SCOPES = ['general', 'mate'] as const;
export type ShopScope = (typeof SHOP_SCOPES)[number];

export const SHOP_SCOPE_LABELS: Record<ShopScope, string> = {
  general: '일반 상점',
  mate: '메이트 전용 상점',
};

export const SHOP_SCOPE_DESC: Record<ShopScope, string> = {
  general: '모든 회원이 디베이트포인트로 교환할 수 있습니다.',
  mate: '디베이트메이트에게만 열리는 카탈로그입니다.',
};

export function asShopScope(value: string | null | undefined): ShopScope {
  return value === 'mate' ? 'mate' : 'general';
}

/** 이 역할이 볼 수 있는 상점 범위 — 메이트는 둘 다 본다. */
export function visibleScopes(role: string): ShopScope[] {
  return role === 'debate_mate' || role === 'admin' ? ['general', 'mate'] : ['general'];
}

export function canOrderScope(role: string, scope: string): boolean {
  return visibleScopes(role).includes(asShopScope(scope));
}

/* ---------- 연락처 ---------- */

export const CONTACT_TYPES = [
  { value: 'phone', label: '휴대폰 번호', placeholder: '010-1234-5678', hint: '기프티콘은 보통 문자로 발송됩니다.' },
  { value: 'email', label: '이메일', placeholder: 'you@example.com', hint: '쿠폰 코드를 메일로 받습니다.' },
] as const;

export type ContactType = (typeof CONTACT_TYPES)[number]['value'];

/**
 * 연락처 형식 확인 — 틀린 번호로 발송되면 되돌릴 수 없다.
 * 엄격하게 잡기보다 "명백히 잘못된 것"만 거른다(해외 번호·사내 메일 등을 막지 않도록).
 */
export function validateContact(type: string, value: string): string | null {
  const v = value.trim();
  if (!v) return '발송받을 연락처를 입력해 주세요.';
  if (type === 'phone') {
    const digits = v.replace(/[^0-9]/g, '');
    if (digits.length < 9 || digits.length > 13) return '휴대폰 번호를 확인해 주세요.';
    return null;
  }
  if (!v.includes('@') || v.startsWith('@') || v.endsWith('@')) return '이메일 주소를 확인해 주세요.';
  return null;
}

/** 콘솔 목록에 표시할 마스킹 연락처 — 발송 확인에 필요한 만큼만 남긴다. */
export function maskContact(type: string | null, value: string | null): string {
  if (!value) return '미입력';
  if (type === 'phone') {
    const d = value.replace(/[^0-9]/g, '');
    return d.length >= 7 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : '***';
  }
  const [local, domain] = value.split('@');
  return domain ? `${local.slice(0, 2)}***@${domain}` : '***';
}
