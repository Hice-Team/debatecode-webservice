// AI Search 답변 피드백의 사유 카탈로그.
//
// 사유를 자유 서술로만 받으면 모이는 대로 읽어야 해서 사실상 아무도 보지 않게 된다.
// 고정 항목으로 받아 집계하고, 보충 설명만 자유 입력으로 덧붙이게 했다.
//
// 이 파일은 순수 카탈로그다 — DB를 건드리지 않으므로 클라이언트에서도 import한다.
// (permissions.ts와 같은 규칙)

export const FEEDBACK_RATINGS = ['up', 'down'] as const;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

export function isFeedbackRating(value: unknown): value is FeedbackRating {
  return typeof value === 'string' && (FEEDBACK_RATINGS as readonly string[]).includes(value);
}

interface ReasonDef {
  /** 어느 평가에 딸린 사유인가 */
  rating: FeedbackRating;
  ko: string;
  en: string;
}

export const FEEDBACK_REASONS = {
  inaccurate: { rating: 'down', ko: '사실과 다름', en: 'Inaccurate' },
  'not-helpful': { rating: 'down', ko: '질문과 상관없음', en: 'Off-topic' },
  incomplete: { rating: 'down', ko: '내용이 부족함', en: 'Incomplete' },
  'too-long': { rating: 'down', ko: '너무 장황함', en: 'Too verbose' },
  'no-source': { rating: 'down', ko: '근거를 알 수 없음', en: 'No sources' },
  unsafe: { rating: 'down', ko: '부적절하거나 위험함', en: 'Unsafe or inappropriate' },
  'bad-format': { rating: 'down', ko: '형식이 읽기 어려움', en: 'Hard to read' },

  accurate: { rating: 'up', ko: '정확함', en: 'Accurate' },
  clear: { rating: 'up', ko: '설명이 명확함', en: 'Clear' },
  complete: { rating: 'up', ko: '필요한 내용이 다 있음', en: 'Complete' },
} as const satisfies Record<string, ReasonDef>;

export type FeedbackReason = keyof typeof FEEDBACK_REASONS;

export const ALL_FEEDBACK_REASONS = Object.keys(FEEDBACK_REASONS) as FeedbackReason[];

export function isFeedbackReason(value: unknown): value is FeedbackReason {
  return typeof value === 'string' && value in FEEDBACK_REASONS;
}

/** 해당 평가에 고를 수 있는 사유들. */
export function reasonsFor(rating: FeedbackRating): FeedbackReason[] {
  return ALL_FEEDBACK_REASONS.filter((key) => FEEDBACK_REASONS[key].rating === rating);
}

export function reasonLabel(reason: string, language: string): string {
  const def = (FEEDBACK_REASONS as Record<string, ReasonDef>)[reason];
  if (!def) return reason;
  return language === 'en' ? def.en : def.ko;
}

/** 보충 설명 길이 상한 — 서버·클라이언트가 같은 값을 쓴다. */
export const FEEDBACK_COMMENT_MAX = 500;
