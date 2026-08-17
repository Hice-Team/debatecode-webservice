import { prisma } from './prisma';

export type SanctionAction = 'post' | 'comment' | 'read';

const ACTION_LABEL: Record<SanctionAction, string> = {
  post: '글 작성',
  comment: '답글 작성',
  read: '커뮤니티 열람',
};

function fmtUntil(expiresAt: Date | null): string {
  return expiresAt ? `해제: ${expiresAt.toLocaleString('ko-KR')}` : '무기한';
}

// 제재 확인 — 해당 행위(action)가 제한된 계정이면 안내 메시지를, 아니면 null을 반환한다.
// 신규 Sanction 이력 모델(type별)과 레거시 suspendedUntil(글/답글 광범위 제한)을 함께 검사한다.
// createPost / createComment 등 커뮤니티 쓰기 액션과 열람 진입 앞단에서 호출.
export async function sanctionMessage(userId: string, action: SanctionAction): Promise<string | null> {
  const now = new Date();

  const [sanctions, user] = await Promise.all([
    prisma.sanction.findMany({
      where: { userId, active: true, type: action },
      select: { expiresAt: true },
    }),
    // 열람 제한은 레거시 suspendedUntil의 대상이 아니다(글/답글만).
    action === 'read'
      ? Promise.resolve(null)
      : prisma.user.findUnique({ where: { id: userId }, select: { suspendedUntil: true } }),
  ]);

  // 활성 제재 중 아직 만료되지 않은 것(만료 없음=영구 포함)
  const live = sanctions.find((s) => !s.expiresAt || s.expiresAt > now);
  if (live) {
    return `${ACTION_LABEL[action]}이(가) 제한된 계정입니다. (${fmtUntil(live.expiresAt)})`;
  }

  if (user?.suspendedUntil && user.suspendedUntil > now) {
    return `커뮤니티 이용이 제한된 계정입니다. (해제: ${user.suspendedUntil.toLocaleString('ko-KR')})`;
  }
  return null;
}

// 하위 호환 — 기존 호출부(글/답글 작성)용. 내부적으로 sanctionMessage('post')로 위임.
export async function suspensionMessage(userId: string): Promise<string | null> {
  return sanctionMessage(userId, 'post');
}
