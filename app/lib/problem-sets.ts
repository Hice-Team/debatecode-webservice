// 문제집 세트 공용 상수 — 서버 액션('use server')은 async 함수만 export할 수 있어 여기로 분리한다.

export const SET_KINDS = ['exam', 'mock', 'theme'] as const;
export type SetKind = (typeof SET_KINDS)[number];

export const SET_KIND_LABELS: Record<SetKind, string> = {
  exam: '기출 모음집',
  mock: '실전 모의고사',
  theme: '테마 문제집',
};

// 라이브러리 카드/필터 배지 스타일
export const SET_KIND_BADGE: Record<SetKind, string> = {
  exam: 'border-brand-200 bg-brand-50 text-brand-700',
  mock: 'border-rose-200 bg-rose-50 text-rose-600',
  theme: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export function isSetKind(value: unknown): value is SetKind {
  return typeof value === 'string' && (SET_KINDS as readonly string[]).includes(value);
}

export function asSetKind(value: unknown): SetKind {
  return isSetKind(value) ? value : 'exam';
}
