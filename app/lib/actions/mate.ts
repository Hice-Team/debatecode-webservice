'use server';

// 디베이트메이트 활동 콘솔 액션 — SNS 홍보 인증 신청, 디베이트샵 주문/취소.
//
// 포인트 지급은 언제나 "승인 후"에만 일어난다. 인증 신청은 pending으로만 쌓이고,
// 관리자가 승인할 때 비로소 원장에 적립된다(app/lib/actions/admin-points.ts).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { verifySession, getUser } from '../dal';
import { prisma } from '../prisma';
import { POINT_AMOUNTS, POINT_KINDS, grantPoints } from '../points';


export interface MateActionState {
  errors?: { form?: string[] };
  saved?: boolean;
  message?: string;
}

/* ---------- SNS 홍보 활동 인증 신청 ---------- */

const snsSchema = z.object({
  postId: z.string().min(1, '신청할 SNS 게시글을 선택해 주세요.'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
});

/**
 * SNS 게시판에 이미 올린 글을 골라 홍보 활동 인증을 신청한다.
 * 글의 외부 URL과 플랫폼을 그대로 근거로 삼으므로 별도 URL 입력을 받지 않는다.
 */
export async function requestSnsPromo(_prev: MateActionState, formData: FormData): Promise<MateActionState> {
  const { userId } = await verifySession();

  const parsed = snsSchema.safeParse({
    postId: formData.get('postId'),
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) {
    return { errors: { form: Object.values(z.flattenError(parsed.error).fieldErrors).flat() } };
  }

  const post = await prisma.post.findUnique({
    where: { id: parsed.data.postId },
    select: { id: true, board: true, authorId: true, title: true, url: true, snsPlatform: true },
  });
  if (!post || post.board !== 'sns') return { errors: { form: ['SNS 게시판의 글만 신청할 수 있습니다.'] } };
  if (post.authorId !== userId) return { errors: { form: ['본인이 작성한 글만 신청할 수 있습니다.'] } };
  if (!post.url) return { errors: { form: ['외부 링크가 없는 글은 인증할 수 없습니다.'] } };

  // 같은 글로 중복 신청 방지 — 반려된 건은 다시 신청할 수 있다
  const duplicate = await prisma.pointRequest.findFirst({
    where: { userId, kind: 'sns_promo', status: { in: ['pending', 'approved'] } },
    select: { id: true, payload: true },
  });
  if (duplicate) {
    const payload = duplicate.payload as { postId?: string };
    if (payload?.postId === post.id) {
      return { errors: { form: ['이 글은 이미 신청했거나 승인된 상태입니다.'] } };
    }
  }

  await prisma.pointRequest.create({
    data: {
      userId,
      kind: 'sns_promo',
      amount: POINT_AMOUNTS[POINT_KINDS.snsApproved],
      payload: {
        postId: post.id,
        title: post.title,
        url: post.url,
        platform: post.snsPlatform ?? 'etc',
        description: parsed.data.description || '',
      },
    },
  });

  revalidatePath('/debate-mate/console');
  revalidatePath('/console/points');
  return { saved: true, message: '인증 신청을 접수했습니다. 운영진 검토 후 포인트가 지급됩니다.' };
}

/* ---------- 디베이트샵 주문 ---------- */

/**
 * 상품을 주문한다. 주문 즉시 포인트를 차감(원장에 음수 기록)하고 주문은 requested 상태가 된다.
 * 실제 쿠폰 발급은 운영자 확정(또는 발급 채널 연동) 단계에서 이뤄진다.
 */
/* 상점(기프티콘 교환)은 제거됐다 — 주문·취소 액션도 함께 걷어냈다.
   포인트는 상점 화폐가 아니라 랭킹 기여도로만 남는다. */

export async function grantAdoptionPoints(input: {
  board: string;
  commentId: string;
  answererId: string;
  answererRole?: string;
  /** 문의게시판에서 질문자가 건 채택 포인트 */
  bounty?: number | null;
}) {
  const isMentor = input.board === 'mentor';
  const kind = isMentor ? POINT_KINDS.mentorAdopted : POINT_KINDS.qnaAdopted;

  // 지급 대상이 아닌 역할 — 채택 자체는 그대로 남고 포인트만 쌓이지 않는다
  if (input.answererRole && input.answererRole !== 'debate_mate') return;

  const amount = isMentor ? POINT_AMOUNTS[kind] : (input.bounty ?? POINT_AMOUNTS[kind]);
  await grantPoints({
    userId: input.answererId,
    amount,
    kind,
    refType: 'comment',
    refId: input.commentId,
  });
}

/** 현재 사용자가 메이트 콘솔을 쓸 수 있는지 — 메이트/관리자만 */
export async function canUseMateConsole(): Promise<boolean> {
  const user = await getUser();
  return user.role === 'debate_mate' || user.role === 'admin';
}
