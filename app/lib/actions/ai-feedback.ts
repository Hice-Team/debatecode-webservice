'use server';

// AI Search 답변 피드백 — 👍/👎 와 사유를 남긴다.
//
// 신고(reportAiMessage)와 나누어 둔 이유: 신고는 법적 문제를 운영 큐로 올리는 절차라
// 처리 상태와 담당자가 붙지만, 피드백은 품질 지표라 집계만 하면 된다. 한 표로 합치면
// "신고 3건"에 단순 불만족이 섞여 들어와 큐를 신뢰할 수 없게 된다.
import { verifySession } from '../dal';
import { prisma } from '../prisma';
import {
  FEEDBACK_COMMENT_MAX,
  isFeedbackRating,
  isFeedbackReason,
  type FeedbackRating,
  type FeedbackReason,
} from '../ai/feedback-reasons';

export interface FeedbackInput {
  messageId: string;
  rating: string;
  reasons?: string[];
  comment?: string;
}

/**
 * 피드백을 남기거나 갱신한다 — 같은 답변에 다시 보내면 덮어쓴다.
 * 자기 대화의 답변에만 남길 수 있다.
 */
export async function submitAiFeedback(input: FeedbackInput): Promise<{ saved?: boolean; error?: string }> {
  const { userId } = await verifySession();

  const messageId = String(input.messageId ?? '');
  if (!messageId) return { error: '대상을 찾지 못했습니다.' };
  if (!isFeedbackRating(input.rating)) return { error: '평가 값이 올바르지 않습니다.' };
  const rating: FeedbackRating = input.rating;

  // 사유는 카탈로그에 있는 코드만 받는다(임의 문자열이 집계에 섞이지 않도록).
  const reasons: FeedbackReason[] = Array.from(new Set(input.reasons ?? [])).filter(isFeedbackReason);
  const comment = String(input.comment ?? '').trim().slice(0, FEEDBACK_COMMENT_MAX);

  const message = await prisma.aiMessage.findFirst({
    where: { id: messageId, role: 'assistant', session: { userId } },
    select: { id: true, model: true },
  });
  if (!message) return { error: '평가할 답변을 찾지 못했습니다.' };

  await prisma.aiFeedback.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: {
      messageId,
      userId,
      rating,
      reasons,
      comment: comment || null,
      model: message.model,
    },
    update: { rating, reasons, comment: comment || null },
  });

  return { saved: true };
}

/** 피드백을 취소한다 — 같은 버튼을 다시 누른 경우. */
export async function clearAiFeedback(messageId: string): Promise<{ saved?: boolean }> {
  const { userId } = await verifySession();
  if (!messageId) return {};
  await prisma.aiFeedback.deleteMany({ where: { messageId, userId } });
  return { saved: true };
}
