// 등급(티어) 체계 — 디베이트포인트 누적치(User.starScore) 기준.
// 디베이트메이트 활동 보상 정책의 등급 구간과 동일하게 맞춘다.
export const RANKS = [
  { name: 'Bronze', min: 0, max: 499 },
  { name: 'Silver', min: 500, max: 1_499 },
  { name: 'Gold', min: 1_500, max: 2_999 },
  { name: 'Platinum', min: 3_000, max: 5_999 },
  { name: 'Diamond', min: 6_000, max: Number.POSITIVE_INFINITY },
] as const;

export type RankName = (typeof RANKS)[number]['name'];

/** 등급 배지 색 — 화면 어디서든 같은 톤을 쓴다. */
export const RANK_BADGE: Record<RankName, string> = {
  Bronze: 'border-amber-200 bg-amber-50 text-amber-800',
  Silver: 'border-slate-200 bg-slate-50 text-slate-600',
  Gold: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  Platinum: 'border-sky-200 bg-sky-50 text-sky-700',
  Diamond: 'border-brand-200 bg-brand-50 text-brand-700',
};

export function rankForScore(score: number) {
  return [...RANKS].reverse().find((rank) => score >= rank.min) ?? RANKS[0];
}

/** 다음 등급까지 남은 점수 — 최고 등급이면 null. */
export function nextRankFor(score: number) {
  return RANKS.find((rank) => rank.min > score) ?? null;
}

/** 100점 기준: 풀이 정확도 35 + 난이도/효율 15 + 면접 30 + 활동 20. */
export function calculateStarScore(input: { solveAccuracy: number; solveDepth: number; interviewScore: number; weeklyActivity: number }) {
  return Math.round(
    Math.min(35, input.solveAccuracy * 0.35) + Math.min(15, input.solveDepth * 0.15) +
    Math.min(30, input.interviewScore * 0.3) + Math.min(20, input.weeklyActivity * 0.2),
  );
}
