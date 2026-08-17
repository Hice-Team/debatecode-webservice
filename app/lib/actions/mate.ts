'use server';

// 디베이트메이트 활동 콘솔 액션 — SNS 홍보 인증 신청, 디베이트샵 주문/취소.
//
// 포인트 지급은 언제나 "승인 후"에만 일어난다. 인증 신청은 pending으로만 쌓이고,
// 관리자가 승인할 때 비로소 원장에 적립된다(app/lib/actions/admin-points.ts).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { verifySession, getUser } from '../dal';
import { prisma } from '../prisma';
import { POINT_AMOUNTS, POINT_KINDS, getPointSummary, grantPoints } from '../points';
import { SNS_PLATFORMS } from '@/app/community/boards';

const PLATFORM_KEYS = SNS_PLATFORMS.map((p) => p.key) as [string, ...string[]];

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
export async function orderShopProduct(_prev: MateActionState, formData: FormData): Promise<MateActionState> {
  const { userId } = await verifySession();
  const productId = String(formData.get('productId') ?? '');
  if (!productId) return { errors: { form: ['상품을 선택해 주세요.'] } };

  const product = await prisma.shopProduct.findUnique({ where: { id: productId } });
  if (!product || !product.active) return { errors: { form: ['판매 중인 상품이 아닙니다.'] } };

  const summary = await getPointSummary(userId);
  if (summary.balance < product.priceKrw) {
    return { errors: { form: [`포인트가 부족합니다. (보유 ${summary.balance.toLocaleString()}P / 필요 ${product.priceKrw.toLocaleString()}P)`] } };
  }

  // 주문 생성과 포인트 차감을 한 트랜잭션으로 묶는다 — 차감만 되고 주문이 없는 상태를 막는다
  await prisma.$transaction(async (tx) => {
    const order = await tx.shopOrder.create({
      data: { userId, productId: product.id, pointsSpent: product.priceKrw, status: 'requested' },
    });
    await tx.pointLedger.create({
      data: {
        userId,
        amount: -product.priceKrw,
        kind: POINT_KINDS.shopPurchase,
        memo: `${product.brand} ${product.name}`,
        refType: 'shopOrder',
        refId: order.id,
      },
    });
  });

  revalidatePath('/debate-mate/console');
  revalidatePath('/console/points');
  return { saved: true, message: '주문이 접수되었습니다. 발급이 완료되면 쿠폰 코드가 표시됩니다.' };
}

/** 발급 전(requested) 주문을 사용자가 취소한다 — 차감한 포인트를 환불 원장으로 되돌린다. */
export async function cancelShopOrder(formData: FormData): Promise<void> {
  const { userId } = await verifySession();
  const orderId = String(formData.get('orderId') ?? '');
  if (!orderId) return;

  const order = await prisma.shopOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId || order.status !== 'requested') return;

  await prisma.$transaction(async (tx) => {
    await tx.shopOrder.update({ where: { id: orderId }, data: { status: 'canceled' } });
    await tx.pointLedger.create({
      data: {
        userId,
        amount: order.pointsSpent,
        kind: POINT_KINDS.shopRefund,
        memo: '주문 취소 환불',
        refType: 'shopOrder',
        refId: order.id,
      },
    });
  });

  revalidatePath('/debate-mate/console');
}

/* ---------- 채택 시 포인트 적립 (댓글 채택 액션에서 호출) ---------- */

/** 답변 채택 보상 — 게시판에 따라 지급액이 다르다. 중복 지급은 원장 유니크가 막는다. */
export async function grantAdoptionPoints(input: { board: string; commentId: string; answererId: string }) {
  const kind = input.board === 'mentor' ? POINT_KINDS.mentorAdopted : POINT_KINDS.qnaAdopted;
  await grantPoints({
    userId: input.answererId,
    amount: POINT_AMOUNTS[kind],
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
