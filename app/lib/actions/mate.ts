'use server';

// 디베이트메이트 활동 콘솔 액션 — SNS 홍보 인증 신청, 디베이트샵 주문/취소.
//
// 포인트 지급은 언제나 "승인 후"에만 일어난다. 인증 신청은 pending으로만 쌓이고,
// 관리자가 승인할 때 비로소 원장에 적립된다(app/lib/actions/admin-points.ts).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { verifySession, getUser } from '../dal';
import { prisma } from '../prisma';
import { canOrderScope, validateContact } from '../shop-scope';
import { featureBlockMessage } from '../settings';
import { POINT_AMOUNTS, POINT_KINDS, getPointSummary, grantPoints } from '../points';


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

  // 발급 채널이 죽었을 때 콘솔에서 끈다 — 포인트만 빠지고 쿠폰이 안 나오는 사고를 막는다
  const blocked = await featureBlockMessage('flag.shop_order', '기프티콘 발급이 일시 중지되었습니다. 포인트는 그대로 유지됩니다.');
  if (blocked) return { errors: { form: [blocked] } };

  const productId = String(formData.get('productId') ?? '');
  if (!productId) return { errors: { form: ['상품을 선택해 주세요.'] } };

  const product = await prisma.shopProduct.findUnique({ where: { id: productId } });
  if (!product || !product.active) return { errors: { form: ['판매 중인 상품이 아닙니다.'] } };

  // 메이트 전용 카탈로그는 메이트만 주문할 수 있다.
  // 화면에서 감추는 것만으로는 부족하다 — 상품 ID만 알면 폼을 직접 보낼 수 있다.
  const buyer = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!canOrderScope(buyer?.role ?? 'user', product.scope)) {
    return { errors: { form: ['디베이트메이트 전용 상품입니다.'] } };
  }

  // 발송받을 연락처 — 없으면 발급해 놓고 어디로 보낼지 몰라 운영자가 따로 물어야 했다
  const contactType = String(formData.get('contactType') ?? 'phone');
  const contact = String(formData.get('contact') ?? '').trim();
  const contactError = validateContact(contactType, contact);
  if (contactError) return { errors: { form: [contactError] } };

  if (product.stock != null && product.stock <= 0) {
    return { errors: { form: ['재고가 소진된 상품입니다.'] } };
  }

  const summary = await getPointSummary(userId);
  if (summary.balance < product.priceKrw) {
    return { errors: { form: [`포인트가 부족합니다. (보유 ${summary.balance.toLocaleString()}P / 필요 ${product.priceKrw.toLocaleString()}P)`] } };
  }

  // 주문 생성과 포인트 차감을 한 트랜잭션으로 묶는다 — 차감만 되고 주문이 없는 상태를 막는다
  await prisma.$transaction(async (tx) => {
    if (product.stock != null) {
      await tx.shopProduct.update({ where: { id: product.id }, data: { stock: { decrement: 1 } } });
    }
    const order = await tx.shopOrder.create({
      data: {
        userId,
        productId: product.id,
        pointsSpent: product.priceKrw,
        status: 'requested',
        contact,
        contactType,
      },
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
  revalidatePath('/shop');
  revalidatePath('/shop/orders');
  return {
    saved: true,
    message: '주문이 접수되었습니다. 운영자 승인 후 입력하신 연락처로 발송됩니다.',
  };
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

/**
 * 답변 채택 보상. 중복 지급은 원장 유니크가 막는다.
 *
 * 두 가지를 판단한다.
 *
 *   얼마를  문의게시판은 질문자가 건 채택 포인트(10~50P)를 그대로 준다. 값이 없는 옛 글은
 *           기본 지급액으로 떨어진다. 멘토게시판은 종전대로 고정액이다.
 *   누구에게 운영진(관리자)이 채택받은 경우에는 지급하지 않는다. 운영진의 답변은 업무이지
 *           보상 대상이 아니고, 스스로 답하고 스스로 받는 구조가 되면 원장이 신뢰를 잃는다.
 *           협력사 역시 제휴 관계에서 답하는 것이라 포인트 대상이 아니다.
 *           즉 실제로 쌓이는 쪽은 디베이트메이트다.
 */
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
