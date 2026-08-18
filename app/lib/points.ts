// 디베이트포인트 정책과 원장 계산.
//
// 포인트는 이제 디베이트메이트 전용이 아니다 — 모든 회원이 쌓고 쓴다.
//
// 지급 원칙 둘:
//   1) 기여 활동(출제·채택·홍보)은 검토/채택이 끝난 시점에만 쌓인다. 신청만으로는 안 준다.
//   2) 문제 풀이는 "풀었다"가 아니라 **얼마나 잘 풀었나**에 비례해 준다. 난이도와 통과율을
//      곱해서 산정하므로, 쉬운 문제를 반복해 긁어모으는 방식으로는 의미 있는 양이 모이지 않는다.
//      같은 문제는 최초 만점 1회만 지급한다(refType/refId 유니크 제약이 강제).
//
// 잔액은 별도 컬럼 없이 PointLedger.amount 합으로만 구한다(이중 기록 방지 + 감사 추적).
import { prisma } from './prisma';

/** 1,000P = 1,000원 */
export const POINT_TO_KRW = 1;

export const POINT_KINDS = {
  problemApproved: 'problem_approved',
  mentorAdopted: 'mentor_adopted',
  qnaAdopted: 'qna_adopted',
  snsApproved: 'sns_approved',
  problemSolved: 'problem_solved',
  bonus: 'bonus',
  shopPurchase: 'shop_purchase',
  shopRefund: 'shop_refund',
  adminAdjust: 'admin_adjust',
} as const;

export type PointKind = (typeof POINT_KINDS)[keyof typeof POINT_KINDS];

/** 지급 기준 — 활동 보상 정책의 기본 포인트 */
export const POINT_AMOUNTS: Record<string, number> = {
  [POINT_KINDS.problemApproved]: 30,
  [POINT_KINDS.mentorAdopted]: 20,
  [POINT_KINDS.qnaAdopted]: 10,
  [POINT_KINDS.snsApproved]: 20,
};

/* ---------- 문제 풀이 보상 ---------- */

/** 난이도별 만점 기준 포인트 — 1(입문) ~ 4(고급) */
export const SOLVE_POINTS_BY_DIFFICULTY: Record<number, number> = {
  1: 5,
  2: 10,
  3: 20,
  4: 35,
};

/**
 * 문제 풀이 보상 계산.
 *
 * 통과율에 비례하되, 전부 통과했을 때만 만점을 준다. 부분 통과에도 조금 주는 이유는
 * 어려운 문제에 붙어 본 시도 자체가 헛되지 않게 하기 위해서다 — 다만 절반으로 눌러서
 * "일부러 틀리게 여러 번 내는" 방식이 이득이 되지 않게 했다.
 */
export function solvePoints(difficulty: number, passedCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  const base = SOLVE_POINTS_BY_DIFFICULTY[difficulty] ?? SOLVE_POINTS_BY_DIFFICULTY[2];
  const ratio = Math.max(0, Math.min(1, passedCount / totalCount));
  if (ratio >= 1) return base;
  return Math.floor(base * ratio * 0.5);
}

export const POINT_KIND_LABELS: Record<string, string> = {
  [POINT_KINDS.problemApproved]: '문제 출제 승인',
  [POINT_KINDS.mentorAdopted]: '멘토 답변 채택',
  [POINT_KINDS.qnaAdopted]: '문의 답변 채택',
  [POINT_KINDS.snsApproved]: 'SNS 홍보 승인',
  [POINT_KINDS.problemSolved]: '문제 해결 보상',
  [POINT_KINDS.bonus]: '우수 기여 보너스',
  [POINT_KINDS.shopPurchase]: '디베이트샵 사용',
  [POINT_KINDS.shopRefund]: '주문 취소 환불',
  [POINT_KINDS.adminAdjust]: '운영자 조정',
};

/** 적립인지 사용인지 — 내역 화면이 부호 대신 이 값으로 색을 정한다 */
export function isEarning(kind: string): boolean {
  return kind !== POINT_KINDS.shopPurchase;
}

export interface PointSummary {
  /** 확정 잔액 — 원장 합계 */
  balance: number;
  /** 적립 예정 — 승인 대기 중인 인증 신청 합계 */
  pending: number;
  /** 사용 예정 — 발급 대기(requested) 주문 합계. 이미 잔액에서 차감된 금액이다. */
  reserved: number;
  totalEarned: number;
  totalSpent: number;
}

/** 사용자 포인트 현황 — 콘솔 상단 요약에 그대로 쓴다. */
export async function getPointSummary(userId: string): Promise<PointSummary> {
  const [earned, spent, pendingRequests, reservedOrders] = await Promise.all([
    prisma.pointLedger.aggregate({ where: { userId, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.pointLedger.aggregate({ where: { userId, amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.pointRequest.aggregate({ where: { userId, status: 'pending' }, _sum: { amount: true } }),
    prisma.shopOrder.aggregate({ where: { userId, status: 'requested' }, _sum: { pointsSpent: true } }),
  ]);

  const totalEarned = earned._sum.amount ?? 0;
  const totalSpent = Math.abs(spent._sum.amount ?? 0);

  return {
    balance: totalEarned - totalSpent,
    pending: pendingRequests._sum.amount ?? 0,
    reserved: reservedOrders._sum.pointsSpent ?? 0,
    totalEarned,
    totalSpent,
  };
}

/**
 * 원장에 적립/차감을 기록한다.
 * (userId, kind, refType, refId) 유니크 제약이 중복 지급을 막으므로, 같은 활동을 다시
 * 처리해도 두 번 쌓이지 않는다. 이미 있으면 null을 반환한다.
 */
export async function grantPoints(input: {
  userId: string;
  amount: number;
  kind: PointKind;
  memo?: string;
  refType?: string;
  refId?: string;
}) {
  if (input.amount === 0) return null;
  try {
    return await prisma.pointLedger.create({
      data: {
        userId: input.userId,
        amount: input.amount,
        kind: input.kind,
        memo: input.memo ?? POINT_KIND_LABELS[input.kind] ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      },
    });
  } catch {
    return null; // 유니크 충돌 = 이미 지급됨
  }
}
