// 콘솔 표시용 개인정보 최소화 — 이메일 전체 노출 금지, 이름은 제재 대상 식별이
// 가능한 수준까지만 마스킹해서 내려보낸다. (클라이언트에는 마스킹된 값만 전달)

// 이름 마스킹: "강석호" → "강*호", "김철" → "김*", "Jonathan" → "J***n"
export function maskName(name: string): string {
  const t = (name ?? '').trim();
  if (!t) return '이름없음';
  if (t.length === 1) return `${t}*`;
  if (t.length === 2) return `${t[0]}*`;
  return `${t[0]}${'*'.repeat(Math.min(t.length - 2, 3))}${t[t.length - 1]}`;
}

// 이메일 마스킹: "makeplayer12@gmail.com" → "ma***@gmail.com" (문의 회신 대상 확인용)
export function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return '비회원';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

// 로그인 방식 라벨 — auth.users의 provider 값 기준
const PROVIDER_LABELS: Record<string, string> = {
  email: '이메일',
  google: '구글',
  naver: '네이버',
  kakao: '카카오',
  github: '깃허브',
  discord: '디스코드',
  sso: 'SSO',
};

export function providerLabel(provider?: string | null): string {
  if (!provider) return '이메일';
  return PROVIDER_LABELS[provider.toLowerCase()] ?? provider;
}
