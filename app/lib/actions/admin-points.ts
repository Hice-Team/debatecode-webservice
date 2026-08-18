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
import { POINT_KINDS, grantPoints, getPointSummary } from '../points';
import { audit } from '../audit';
import { maskName } from '../privacy';

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

export interface PointGrantState {
  error?: string;
  saved?: string;
}

/**
 * 운영자 수동 포인트 지급·차감.
 *
 * 쓰이는 자리가 둘이다:
 *   · 잘못된 처리로 환급이 안 된 경우의 보정 (양수)
 *   · 이벤트 보상, 잘못 지급된 포인트 회수 (양수/음수)
 *
 * 사유를 필수로 받는 이유: 원장은 감사 대상이다. "누가 왜 줬는지" 없이 숫자만 남으면
 * 나중에 정산이 맞는지 확인할 방법이 없다. 같은 사유로 여러 번 줄 수 있어야 하므로
 * 중복 방지 키에는 시각을 넣는다.
 */
export async function adjustPoints(
  _prev: PointGrantState,
  formData: FormData,
): Promise<PointGrantState> {
  try {
    const caller = await requireReviewer();
    const userId = String(formData.get('userId') ?? '');
    const amount = Math.trunc(Number(formData.get('amount')));
    const memo = String(formData.get('memo') ?? '').trim();

    if (!userId) return { error: '대상 계정을 고르세요.' };
    if (!Number.isFinite(amount) || amount === 0) return { error: '0이 아닌 포인트를 입력하세요.' };
    if (Math.abs(amount) > 1_000_000) return { error: '한 번에 1,000,000P를 넘길 수 없습니다.' };
    if (memo.length < 4) return { error: '지급 사유를 4자 이상 적어 주세요.' };

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    if (!target) return { error: '대상 계정을 찾을 수 없습니다.' };

    // 차감이면 잔액을 넘지 않는지 확인한다 — 음수 잔액은 상점 로직 전체를 흔든다
    if (amount < 0) {
      const { balance } = await getPointSummary(userId);
      if (balance + amount < 0) {
        return { error: `잔액이 부족합니다. (보유 ${balance.toLocaleString()}P)` };
      }
    }

    await grantPoints({
      userId,
      amount,
      kind: POINT_KINDS.adminAdjust,
      memo,
      refType: 'admin',
      refId: `${caller.id}:${Date.now()}`,
    });

    await audit({
      actor: caller,
      action: 'point.adjust',
      targetType: 'user',
      targetId: userId,
      summary: `${maskName(target.name)} 포인트 ${amount > 0 ? '+' : ''}${amount.toLocaleString()}P — ${memo}`,
      diff: { after: { amount, memo } },
    });

    revalidatePath('/console/points');
    revalidatePath('/debate-mate/console');
    revalidatePath('/shop');
    return {
      saved: `${maskName(target.name)}에게 ${amount > 0 ? '+' : ''}${amount.toLocaleString()}P를 반영했습니다.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '지급에 실패했습니다.' };
  }
}
