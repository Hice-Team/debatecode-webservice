// 커뮤니티 작성자 표시 — 이름(익명이면 식별자) + 역할 배지 + 등급 배지.
// 글 목록·글 상세·답글에서 같은 규칙으로 쓰기 위해 한 곳에 모았다.
import I18nSlot from './i18n-slot';
import { displayName } from '@/app/lib/display-name';
import { rankForScore, RANK_BADGE, type RankName } from '@/app/lib/star-score';
import { ROLE_BADGE, ROLE_LABELS, type Role } from '@/app/lib/roles';

export interface BadgeAuthor {
  name: string;
  anonymousTag?: string | null;
  role: string;
  starScore: number;
  rankBadgeVisible: boolean;
}

// 역할 배지를 노출할 역할 — 일반 사용자는 배지를 달지 않는다
const SHOWN_ROLES: Role[] = ['admin', 'reviewer', 'problem_setter', 'debate_mate', 'partner'];

export default function AuthorBadges({
  author,
  anonymous = false,
  className = '',
}: {
  author: BadgeAuthor;
  anonymous?: boolean;
  className?: string;
}) {
  const role = author.role as Role;
  const showRole = !anonymous && SHOWN_ROLES.includes(role);
  // 익명 글에서는 등급 배지도 감춘다 — 등급으로 작성자를 좁힐 수 있기 때문
  const showRank = !anonymous && author.rankBadgeVisible;
  const rank = rankForScore(author.starScore).name as RankName;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span data-no-translate className="text-fg-muted">{displayName(author, anonymous)}</span>

      {showRole && (
        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${ROLE_BADGE[role]}`}>
          <I18nSlot k={`role-${role}`} fallback={ROLE_LABELS[role]} />
        </span>
      )}

      {showRank && (
        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${RANK_BADGE[rank]}`}>{rank}</span>
      )}
    </span>
  );
}
