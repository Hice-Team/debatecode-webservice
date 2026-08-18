'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../prisma';
import { canAdoptAnswer, canReplyToPost, supportsAdoption } from '../board-rules';
import { ensureAnonymousTag } from '../identity';
import { grantAdoptionPoints } from './mate';
import { verifySession, getUser } from '../dal';
import { sanctionMessage } from '../moderation';
import { featureBlockMessage } from '../settings';

export interface CommentFormState {
  errors?: { content?: string[]; form?: string[] };
}

const commentSchema = z.object({
  postId: z.string().min(1),
  parentId: z.string().min(1).optional().or(z.literal('')),
  anonymous: z.boolean().optional(),
  content: z.string().min(1, '댓글 내용을 입력해 주세요.').max(1000, '댓글은 1000자 이하여야 합니다.'),
});

export async function createComment(_prev: CommentFormState, formData: FormData): Promise<CommentFormState> {
  const session = await verifySession();

  const blocked = await featureBlockMessage('flag.community_write');
  if (blocked) return { errors: { form: [blocked] } };

  const suspended = await sanctionMessage(session.userId, 'comment');
  if (suspended) return { errors: { form: [suspended] } };

  const parsed = commentSchema.safeParse({
    postId: formData.get('postId'),
    parentId: formData.get('parentId') ?? '',
    anonymous: formData.get('anonymous') === 'on',
    content: formData.get('content'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { postId, parentId, content, anonymous } = parsed.data;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, board: true, secret: true, verifiedOnlyReplies: true, authorId: true, adoptedCommentId: true },
  });
  if (!post) {
    return { errors: { form: ['게시글을 찾을 수 없습니다.'] } };
  }

  // 게시판 규칙 검사 — 비밀글/인증 답변 전용/채택 완료
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  const permission = canReplyToPost(post, { userId: session.userId, role: me?.role ?? 'user' });
  if (!permission.allowed) {
    const message =
      permission.reason === 'adopted'
        ? '답변이 채택되어 더 이상 답글을 달 수 없습니다.'
        : '이 글에는 관리자와 디베이트메이트만 답글을 달 수 있습니다.';
    return { errors: { form: [message] } };
  }

  if (anonymous) await ensureAnonymousTag(session.userId);

  if (parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentId }, select: { postId: true } });
    if (!parent || parent.postId !== postId) {
      return { errors: { form: ['답글을 작성할 댓글을 찾을 수 없습니다.'] } };
    }
  }

  await prisma.comment.create({
    data: {
      postId,
      parentId: parentId || null,
      authorId: session.userId,
      anonymous: !!anonymous,
      content,
    },
  });

  revalidatePath(`/community/${postId}`);
  return {};
}

const updateCommentSchema = z.object({
  commentId: z.string().min(1),
  content: z.string().min(1, '댓글 내용을 입력해 주세요.').max(1000, '댓글은 1000자 이하여야 합니다.'),
});

// 댓글 수정 — 작성자 본인만
export async function updateComment(_prev: CommentFormState, formData: FormData): Promise<CommentFormState> {
  const session = await verifySession();

  const parsed = updateCommentSchema.safeParse({
    commentId: formData.get('commentId'),
    content: formData.get('content'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { commentId, content } = parsed.data;
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, postId: true },
  });
  if (!comment || comment.authorId !== session.userId) {
    return { errors: { form: ['수정 권한이 없습니다.'] } };
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { content, updatedAt: new Date() },
  });

  revalidatePath(`/community/${comment.postId}`);
  return {};
}

// 댓글 삭제 — 작성자 또는 관리자. 답글은 FK cascade로 함께 삭제.
export async function deleteComment(formData: FormData): Promise<void> {
  const user = await getUser();
  const commentId = String(formData.get('commentId') ?? '');

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, postId: true },
  });
  if (!comment || (comment.authorId !== user.id && user.role !== 'admin')) return;

  await prisma.comment.delete({ where: { id: commentId } });
  revalidatePath(`/community/${comment.postId}`);
}


/* ---------- 답변 채택 (문의게시판) ---------- */

// 글 작성자가 답글 하나를 채택한다. 채택 후에는 그 글에 답글을 달 수 없다.
export async function adoptAnswer(formData: FormData): Promise<void> {
  const session = await verifySession();
  const postId = String(formData.get('postId') ?? '');
  const commentId = String(formData.get('commentId') ?? '');
  if (!postId || !commentId) return;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, board: true, secret: true, verifiedOnlyReplies: true, authorId: true, adoptedCommentId: true },
  });
  if (!post || !supportsAdoption(post.board)) return;
  if (!canAdoptAnswer(post, { userId: session.userId, role: 'user' })) return;

  // 채택 대상은 이 글에 달린 답글이어야 한다
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { postId: true, authorId: true } });
  if (!comment || comment.postId !== postId) return;
  if (comment.authorId === session.userId) return; // 자기 답변은 채택할 수 없다

  await prisma.post.update({
    where: { id: postId },
    data: { adoptedCommentId: commentId, adoptedAt: new Date() },
  });

  // 채택 보상 — 답변자에게 지급. 중복 채택 시도는 원장 유니크가 막는다.
  await grantAdoptionPoints({ board: post.board, commentId, answererId: comment.authorId });

  revalidatePath(`/community/${postId}`);
}
