// 게시판별 열람/작성 규칙.
//
// 문의(qna) · 멘토(mentor) · SNS 게시판만 특별 규칙을 두고, 나머지 게시판은
// 역할과 무관하게 누구나 읽고 쓰고 답글을 달 수 있다.
//
//   qna    — 글은 항상 비밀글. 작성자 본인 + 관리자/디베이트메이트만 열람·답글.
//            작성자가 답변 하나를 채택하면 그 글의 답글은 잠긴다.
//   mentor — '인증된 사용자에게만 답변 받기'를 켜면 답글은 메이트/관리자만.
//            열람은 모든 역할에 열려 있다.
//   sns    — 외부 링크 공유 전용. 열람/작성 제한은 없다.
import type { Role } from './roles';

/** 답변자로 인정되는 역할 — 관리자와 디베이트메이트 */
export function isVerifiedResponder(role: string): boolean {
  return role === 'admin' || role === 'debate_mate';
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

/** 문의게시판 글은 작성 시점에 항상 비밀글로 만든다. */
export function forcedSecret(board: string): boolean {
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

  // 비밀글(문의) — 작성자 본인과 인증 답변자만
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
