// 표시 이름 규칙 — DB 접근이 없는 순수 함수만 둔다.
// 클라이언트 컴포넌트(댓글 스레드 등)도 import 하므로 prisma를 끌어오면 안 된다.
// 식별자 발급(ensureAnonymousTag)은 서버 전용 app/lib/identity.ts에 있다.

/** 글/답글에 표시할 이름 — 익명이면 식별자, 아니면 실명. */
export function displayName(author: { name: string; anonymousTag?: string | null }, anonymous: boolean): string {
  if (!anonymous) return author.name;
  return author.anonymousTag ?? 'Anonymous';
}

/** 명예의 전당 표시 이름 — 등급 비공개면 식별자로 대체한다. */
export function rankingDisplayName(user: { name: string; anonymousTag?: string | null; rankBadgeVisible: boolean }): string {
  if (user.rankBadgeVisible) return user.name;
  return user.anonymousTag ?? 'Anonymous';
}
