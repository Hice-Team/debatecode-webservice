// 커뮤니티 표시 이름 정책.
//
// 사용자는 두 가지 이유로 실명(User.name) 대신 익명 식별자로 표시될 수 있다.
//   1) 글/답글을 익명으로 작성한 경우
//   2) 등급 비공개(rankBadgeVisible=false)라 명예의 전당에 이름을 내지 않는 경우
// 두 경우 모두 같은 고정 식별자(User.anonymousTag)를 쓴다 — 같은 사람이 여러 이름으로
// 보이지 않도록 하되, 실명과는 연결되지 않게 한다.
import { prisma } from './prisma';

/** "Anonymous 4271" 형태 — 뒤 숫자는 2~4자리 난수 */
function randomTag(): string {
  const digits = 2 + Math.floor(Math.random() * 3); // 2~4자리
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return `Anonymous ${min + Math.floor(Math.random() * (max - min + 1))}`;
}

/**
 * 사용자의 익명 식별자를 보장한다 — 없으면 생성해 저장한다.
 * unique 제약이므로 충돌하면 다시 뽑는다(자릿수가 늘어나면 공간도 넓어진다).
 */
export async function ensureAnonymousTag(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { anonymousTag: true } });
  if (existing?.anonymousTag) return existing.anonymousTag;

  for (let attempt = 0; attempt < 8; attempt++) {
    const tag = randomTag();
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { anonymousTag: tag }, select: { anonymousTag: true } });
      return updated.anonymousTag!;
    } catch {
      // unique 충돌 — 다음 후보로 재시도
    }
  }
  // 8회 모두 충돌하는 건 사실상 불가능하지만, 마지막 수단으로 id 파편을 붙인다
  const fallback = `Anonymous ${userId.slice(0, 4)}`;
  await prisma.user.update({ where: { id: userId }, data: { anonymousTag: fallback } });
  return fallback;
}

// 표시 규칙은 클라이언트에서도 쓰이므로 display-name.ts에 있다 — 여기서 재수출한다.
export { displayName, rankingDisplayName } from './display-name';
