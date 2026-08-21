// 게시판별 열람/작성 규칙.
//
// 문의(qna) · 멘토(mentor) · SNS 게시판만 특별 규칙을 두고, 나머지 게시판은
// 역할과 무관하게 누구나 읽고 쓰고 답글을 달 수 있다.
//
//   qna    — 답글은 관리자·디베이트메이트·협력사만. 질문자가 채택 포인트(10~50P)를 걸고,
//            비밀글·익명 여부를 직접 고른다. 비밀글이면 답글도 관리자만 달 수 있다.
//            작성자가 답변 하나를 채택하면 그 글의 답글은 잠긴다.
//   mentor — '인증된 사용자에게만 답변 받기'를 켜면 답글은 메이트/관리자만.
//            열람은 모든 역할에 열려 있다.
//   sns    — 외부 링크 공유 전용. 열람/작성 제한은 없다.
import type { Role } from './roles';

/** 답변자로 인정되는 역할 — 관리자와 디베이트메이트 */
export function isVerifiedResponder(role: string): boolean {
  return role === 'admin' || role === 'debate_mate';
}

/**
 * 문의게시판 답변 자격 — 관리자 · 디베이트메이트 · 협력사 직원.
 *
 * 협력사를 포함하는 이유: 제휴 상품이나 채용처럼 우리가 대신 답할 수 없는 문의가 있다.
 * 그렇다고 아무나 답하게 두면 문의게시판이 추측성 답변으로 채워지므로 여기까지만 연다.
 */
export function canAnswerInquiry(role: string): boolean {
  return isVerifiedResponder(role) || role === 'partner';
}

/** 문의게시판 채택 포인트의 허용 범위 — 질문자가 이 안에서 고른다. */
export const BOUNTY_MIN = 10;
export const BOUNTY_MAX = 50;
export const BOUNTY_DEFAULT = 10;

export function clampBounty(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return BOUNTY_DEFAULT;
  return Math.min(BOUNTY_MAX, Math.max(BOUNTY_MIN, n));
}

/** 채택 포인트를 거는 게시판인가 — 문의게시판만. */
export function supportsBounty(board: string): boolean {
  return board === 'qna';
}

export interface PostAccessInput {
  board: string;
  secret: boolean;
  verifiedOnlyReplies: boolean;
  authorId: string;
  adoptedCommentId: string | null;
}

export interface Viewer {
  userId: string | null;
  role: string;
}

/**
 * 이 게시판에 글을 쓸 수 있는가.
 *
 * 공지사항만 제한한다. 누구나 "공지사항"에 글을 올릴 수 있으면 그 게시판은 공지가 아니라
 * 또 하나의 자유게시판이 되고, 상단 고정까지 붙으므로 사실상 전체 화면을 점유하게 된다.
 */
export function canWriteToBoard(board: string, role: string): boolean {
  if (board === 'notice') return role === 'admin';
  return true;
}

/** 공지로 올릴 수 있는(=상단 고정 체크박스를 볼 수 있는) 게시판인가. */
export function supportsPinning(board: string): boolean {
  return board === 'notice';
}

/**
 * 비밀글을 강제하는 게시판 — 지금은 없다.
 *
 * 예전에는 문의게시판 글을 무조건 비밀글로 만들었다. 그런데 문의의 상당수는 다른 사람도
 * 궁금해하는 내용이라, 전부 감춰 두면 같은 질문이 반복해서 올라온다.
 * 이제 질문자가 공개/비밀을 직접 고른다(비밀글이면 답글도 관리자만 달 수 있다).
 */
export function forcedSecret(_board: string): boolean {
  return false;
}

/**
 * 익명으로 쓸 수 있는 게시판인가.
 *
 * 공지사항만 막는다. 공지는 "누가 말하는지"가 내용의 일부라, 운영진이 아닌 것처럼 보이는
 * 공지는 읽는 사람이 신뢰할 근거를 잃는다. 화면에서 체크박스를 감추는 것만으로는 부족하다 —
 * 폼을 직접 만들어 보내면 그만이므로 서버에서도 같은 판단을 한다.
 */
export function supportsAnonymous(board: string): boolean {
  return board !== 'notice';
}

/** 비밀글 선택지를 제공하는 게시판인가. */
export function supportsSecret(board: string): boolean {
  return board === 'qna';
}

/** 이 글을 열람할 수 있는가 — 비밀글이 아니면 항상 true. */
export function canViewPost(post: PostAccessInput, viewer: Viewer): boolean {
  if (!post.secret) return true;
  if (!viewer.userId) return false;
  if (viewer.userId === post.authorId) return true;
  return isVerifiedResponder(viewer.role);
}

/** 이 글에 답글을 달 수 있는가. */
export function canReplyToPost(post: PostAccessInput, viewer: Viewer): { allowed: boolean; reason?: string } {
  if (!viewer.userId) return { allowed: false, reason: 'login-required' };

  // 채택이 끝난 글은 누구도 더 달 수 없다
  if (post.adoptedCommentId) return { allowed: false, reason: 'adopted' };

  // 문의게시판 — 답변 자격이 있는 사람만. 비밀글이면 관리자까지 좁힌다.
  // (질문자 본인은 자기 글에 보충 설명을 달 수 있어야 하므로 언제나 허용한다)
  if (post.board === 'qna') {
    if (viewer.userId === post.authorId) return { allowed: true };
    if (post.secret) {
      return viewer.role === 'admin' ? { allowed: true } : { allowed: false, reason: 'admin-only' };
    }
    return canAnswerInquiry(viewer.role) ? { allowed: true } : { allowed: false, reason: 'verified-only' };
  }

  // 비밀글 — 작성자 본인과 인증 답변자만
  if (post.secret) {
    const allowed = viewer.userId === post.authorId || isVerifiedResponder(viewer.role);
    return allowed ? { allowed: true } : { allowed: false, reason: 'verified-only' };
  }

  // 멘토게시판에서 '인증된 사용자에게만 답변 받기'를 켠 글
  if (post.verifiedOnlyReplies) {
    const allowed = viewer.userId === post.authorId || isVerifiedResponder(viewer.role);
    return allowed ? { allowed: true } : { allowed: false, reason: 'verified-only' };
  }

  return { allowed: true };
}

/** 답변 채택 권한 — 글 작성자 본인만, 아직 채택 전일 때. */
export function canAdoptAnswer(post: PostAccessInput, viewer: Viewer): boolean {
  return !!viewer.userId && viewer.userId === post.authorId && !post.adoptedCommentId;
}

/** '인증 답변 전용' 옵션을 노출할 게시판인가 — 멘토게시판만. */
export function supportsVerifiedOnly(board: string): boolean {
  return board === 'mentor';
}

/** 채택 기능을 쓰는 게시판인가 — 문의게시판만. */
export function supportsAdoption(board: string): boolean {
  return board === 'qna';
}

/** 목록 쿼리에서 비밀글을 걸러내는 Prisma where 조각. */
export function visiblePostsWhere(viewer: Viewer) {
  if (viewer.userId && isVerifiedResponder(viewer.role)) return {}; // 전부 열람 가능
  if (!viewer.userId) return { secret: false };
  return { OR: [{ secret: false }, { authorId: viewer.userId }] };
}

export type { Role };
