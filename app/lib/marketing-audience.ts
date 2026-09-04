// 발송 대상 구분 — 클라이언트/서버 공용. prisma를 끌어오지 않는다.
//
// 작성 화면(클라이언트 컴포넌트)이 라벨을 쓰는데, marketing.ts는 DB에 붙어 있어서
// 그대로 import하면 pg 드라이버가 브라우저 번들로 딸려 들어간다. 순수 값만 따로 둔다.

export type Audience = 'all' | 'members' | 'guests';

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: '전체 동의자',
  members: '회원만',
  guests: '비회원만',
};

export function isAudience(value: unknown): value is Audience {
  return value === 'all' || value === 'members' || value === 'guests';
}

/* ---------- 대상 좁히기 ----------
 *
 * 회원/비회원 세 칸만으로는 "출시 알림을 신청한 사람에게만" 같은 것을 고를 수 없었다.
 * 조건은 세 축이고, 각 축의 기본값은 "가리지 않음"이다 — 아무것도 고르지 않으면
 * 예전과 똑같이 동작한다.
 */

export type ConsentSourceFilter = 'signup' | 'settings' | 'launch_notify' | 'manual';

export const SOURCE_LABELS: Record<ConsentSourceFilter, string> = {
  signup: '가입 폼',
  settings: '설정 화면',
  launch_notify: '출시 알림 신청',
  manual: '직접 등록',
};

export function isConsentSource(value: unknown): value is ConsentSourceFilter {
  return value === 'signup' || value === 'settings' || value === 'launch_notify' || value === 'manual';
}

/** 동의 시점 — "최근에 들어온 사람에게만" */
export const CONSENT_WINDOWS = [
  { days: null, label: '제한 없음' },
  { days: 30, label: '최근 30일' },
  { days: 90, label: '최근 90일' },
  { days: 180, label: '최근 180일' },
] as const;

/**
 * 피로도 제외 — 최근에 이미 받은 사람은 빼고 보낸다.
 *
 * 이것이 없으면 같은 주에 두 번 보내도 화면이 말리지 않는다. 수신거부가 느는
 * 가장 흔한 이유이고, 보내고 나서는 되돌릴 수 없다.
 */
export const FATIGUE_WINDOWS = [
  { days: null, label: '제외 없음' },
  { days: 7, label: '최근 7일 내 받은 사람 제외' },
  { days: 14, label: '최근 14일 내 받은 사람 제외' },
  { days: 30, label: '최근 30일 내 받은 사람 제외' },
] as const;

export interface AudienceFilters {
  audience: Audience;
  /** null이면 동의 경로를 가리지 않는다 */
  source: ConsentSourceFilter | null;
  /** null이면 동의 시점을 가리지 않는다 */
  consentedWithinDays: number | null;
  /** null이면 최근 발송자를 빼지 않는다 */
  excludeSentWithinDays: number | null;
}

export const DEFAULT_FILTERS: AudienceFilters = {
  audience: 'all',
  source: null,
  consentedWithinDays: null,
  excludeSentWithinDays: null,
};

/** 폼/DB에서 온 값을 조건으로 정규화한다 — 모르는 값은 "가리지 않음"으로 떨어뜨린다 */
export function toFilters(input: {
  audience?: unknown;
  source?: unknown;
  consentedWithinDays?: unknown;
  excludeSentWithinDays?: unknown;
}): AudienceFilters {
  const days = (v: unknown): number | null => {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  return {
    audience: isAudience(input.audience) ? input.audience : 'all',
    source: isConsentSource(input.source) ? input.source : null,
    consentedWithinDays: days(input.consentedWithinDays),
    excludeSentWithinDays: days(input.excludeSentWithinDays),
  };
}

/** 목록 화면에서 "무슨 조건으로 보냈는지" 한 줄로 보여 준다 */
export function describeFilters(f: AudienceFilters): string {
  const parts = [AUDIENCE_LABELS[f.audience]];
  if (f.source) parts.push(SOURCE_LABELS[f.source]);
  if (f.consentedWithinDays) parts.push(`최근 ${f.consentedWithinDays}일 동의`);
  if (f.excludeSentWithinDays) parts.push(`${f.excludeSentWithinDays}일 내 발송 제외`);
  return parts.join(' · ');
}
