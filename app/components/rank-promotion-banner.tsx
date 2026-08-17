import { rankForScore } from '@/app/lib/star-score';

export default function RankPromotionBanner({ name, score }: { name: string; score: number }) {
  const rank = rankForScore(score);
  return <div className="border-b border-amber-200 bg-amber-50 text-amber-950"><div className="mx-auto max-w-7xl px-6 py-2 text-center text-sm"><span className="mr-2">★</span><b>{name.slice(0, 1)}0{ name.slice(2) || '님' }</b> 님이 <b>{rank.name}</b> 등급에서 학습 중입니다. Star 점수 {score.toLocaleString()}점</div></div>;
}
