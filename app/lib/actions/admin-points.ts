'use server';

// 운영 콘솔 — 포인트 인증 신청 심사 / 상점 주문 발급 처리.
//
// 쿠폰 발급은 발급 채널(카카오쇼핑 for biz, 기프티쇼) 연동이 필요하다.
// 지금은 fulfillOrder에 운영자가 코드를 직접 넣는 수동 경로만 열려 있고,
// 채널 연동이 붙으면 이 함수 안에서 발급 API를 호출한 뒤 같은 자리에 결과를 채우면 된다.
import { revalidatePath } from 'next/cache';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { canReview } from '../roles';
import { POINT_KINDS, grantPoints } from '../points';

async function requireReviewer() {
  const caller = await getUser();
  if (!canReview(caller.role)) throw new Error('검토 권한이 없습니다.');
  return caller;
}

/** 활동 인증 신청 승인/반려 — 승인 시에만 원장에 적립된다. */
export async function reviewPointRequest(formData: FormData): Promise<void> {
  const caller = await requireReviewer();
  const id = String(formData.get('id') ?? '');
  const approve = String(formData.get('action') ?? '') === 'approve';
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!id) return;

  const request = await prisma.pointRequest.findUnique({ where: { id } });
  if (!request || request.status !== 'pending') return;

  await prisma.pointRequest.update({
    where: { id },
    data: {
      status: approve ? 'approved' : 'rejected',
      reviewNote: note,
      reviewedById: caller.id,
      reviewedAt: new Date(),
    },
  });

  if (approve) {
    await grantPoints({
      userId: request.userId,
      amount: request.amount,
      kind: POINT_KINDS.snsApproved,
      refType: 'pointRequest',
      refId: request.id,
    });
  }

  revalidatePath('/console/points');
  revalidatePath('/debate-mate/console');
}

/** 상점 주문 발급 확정 — 쿠폰 코드를 기록하고 fulfilled로 넘긴다. */
export async function fulfillShopOrder(formData: FormData): Promise<void> {
  await requireReviewer();
  const id = String(formData.get('id') ?? '');
  const couponCode = String(formData.get('couponCode') ?? '').trim();
  const expiresRaw = String(formData.get('couponExpiresAt') ?? '').trim();
  if (!id || !couponCode) return;

  const order = await prisma.shopOrder.findUnique({ where: { id }, select: { status: true } });
  if (!order || order.status !== 'requested') return;

  await prisma.shopOrder.update({
    where: { id },
    data: {
      status: 'fulfilled',
      couponCode,
      couponExpiresAt: expiresRaw ? new Date(expiresRaw) : null,
      fulfilledAt: new Date(),
    },
  });

  revalidatePath('/console/points');
  revalidatePath('/debate-mate/console');
}

/** 발급 실패 처리 — 차감했던 포인트를 환불한다. */
export async function failShopOrder(formData: FormData): Promise<void> {
  await requireReviewer();
  const id = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || '발급 실패';
  if (!id) return;

  const order = await prisma.shopOrder.findUnique({ where: { id } });
  if (!order || order.status !== 'requested') return;

  await prisma.$transaction(async (tx) => {
    await tx.shopOrder.update({ where: { id }, data: { status: 'failed', failureReason: reason } });
    await tx.pointLedger.create({
      data: {
        userId: order.userId,
        amount: order.pointsSpent,
        kind: POINT_KINDS.shopRefund,
        memo: `발급 실패 환불 — ${reason}`,
        refType: 'shopOrder',
        refId: order.id,
      },
    });
  });

  revalidatePath('/console/points');
  revalidatePath('/debate-mate/console');
}

/** 우수 기여 보너스 등 운영자 수동 지급. */
export async function adjustPoints(formData: FormData): Promise<void> {
  const caller = await requireReviewer();
  const userId = String(formData.get('userId') ?? '');
  const amount = Number(formData.get('amount'));
  const memo = String(formData.get('memo') ?? '').trim() || '운영자 조정';
  if (!userId || !Number.isFinite(amount) || amount === 0) return;

  await grantPoints({
    userId,
    amount: Math.trunc(amount),
    kind: POINT_KINDS.adminAdjust,
    memo,
    refType: 'admin',
    // 같은 운영자가 같은 사유로 여러 번 줄 수 있어야 하므로 시각을 키에 포함한다
    refId: `${caller.id}:${Date.now()}`,
  });

  revalidatePath('/console/points');
  revalidatePath('/debate-mate/console');
}
