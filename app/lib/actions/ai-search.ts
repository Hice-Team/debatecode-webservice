'use server';

// AI Search의 "대화 계층" — 세션 생성/복원/삭제·브랜치·신고.
//
// 질의 자체(검색 → 모델 호출 → 저장)는 진행 상황을 스트리밍해야 해서 서버 액션이 아니라
// 라우트 핸들러(app/api/ai-search/ask/route.ts)가 맡는다. 이 파일은 그 밖의 세션 조작만 다룬다.
import { revalidatePath } from 'next/cache';
import { verifySession } from '../dal';
import { prisma } from '../prisma';
import { DEFAULT_SEARCH_MODEL_ID, isSearchModelId } from '../ai/search-models';
import { isEffort } from '../ai/effort';

/** 첫 질문에서 세션 제목을 만든다 — 너무 길면 자른다. */
function titleFrom(question: string): string {
  const clean = question.replace(/\s+/g, ' ').trim();
  return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean;
}

/** 사용자의 최근 세션 1건 — 없으면 null. */
export async function getRecentSession() {
  const { userId } = await verifySession();
  return prisma.aiSession.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { messages: true } } },
  });
}

/** 세션 목록 — 사이드바에 최신순으로 나열한다. */
export async function listSessions(limit = 40) {
  const { userId } = await verifySession();
  return prisma.aiSession.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, title: true, model: true, updatedAt: true, _count: { select: { messages: true } } },
  });
}

/** 세션 제목 변경. */
export async function renameSession(formData: FormData): Promise<void> {
  const { userId } = await verifySession();
  const sessionId = String(formData.get('sessionId') ?? '');
  const title = String(formData.get('title') ?? '').trim().slice(0, 60);
  if (!sessionId || !title) return;
  await prisma.aiSession.updateMany({ where: { id: sessionId, userId }, data: { title } });
  revalidatePath('/study/search');
}

/** 세션의 기본 모델을 바꾼다 — 다음 질문부터 적용된다. */
export async function setSessionModel(formData: FormData): Promise<void> {
  const { userId } = await verifySession();
  const sessionId = String(formData.get('sessionId') ?? '');
  const model = String(formData.get('model') ?? '');
  if (!sessionId || !isSearchModelId(model)) return;
  // 강도는 함께 와도 되고 안 와도 된다 — 모델만 바꾸는 호출이 더 흔하다
  const effortRaw = formData.get('effort');
  const effort = isEffort(effortRaw) ? effortRaw : undefined;
  await prisma.aiSession.updateMany({
    where: { id: sessionId, userId },
    data: { model, ...(effort ? { effort } : {}) },
  });
  revalidatePath('/study/search');
}

/** 세션 전체(메시지 포함)를 불러온다. 남의 세션은 열 수 없다. */
export async function loadSession(sessionId: string) {
  const { userId } = await verifySession();
  const session = await prisma.aiSession.findFirst({
    where: { id: sessionId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  return session;
}

/**
 * 새 대화 시작 — 빈 세션을 하나 더 만든다.
 * 이전 세션은 목록에 그대로 남으므로 언제든 다시 열 수 있다.
 * 빈 세션이 쌓이지 않도록, 메시지가 없는 세션이 이미 있으면 그것을 재사용한다.
 */
export async function startNewSession(model?: string): Promise<{ sessionId: string }> {
  const { userId } = await verifySession();
  const chosen = isSearchModelId(model) ? model : DEFAULT_SEARCH_MODEL_ID;

  const empty = await prisma.aiSession.findFirst({
    where: { userId, messages: { none: {} } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  if (empty) {
    await prisma.aiSession.update({ where: { id: empty.id }, data: { model: chosen, updatedAt: new Date() } });
    revalidatePath('/study/search');
    return { sessionId: empty.id };
  }

  const created = await prisma.aiSession.create({ data: { userId, model: chosen } });
  revalidatePath('/study');
  revalidatePath('/study/search');
  return { sessionId: created.id };
}

/** 활성 세션을 보장한다 — 없으면 만든다(이어하기 경로). */
export async function ensureSession(): Promise<{ sessionId: string }> {
  const { userId } = await verifySession();
  const existing = await prisma.aiSession.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
  if (existing) return { sessionId: existing.id };
  const created = await prisma.aiSession.create({ data: { userId, model: DEFAULT_SEARCH_MODEL_ID } });
  return { sessionId: created.id };
}

/**
 * 답변 하나를 시작점으로 새 대화를 연다 — 응답 툴바의 "새 채팅에서 브랜치 생성".
 *
 * 답변만 옮기면 무엇에 대한 답인지 알 수 없으므로, 그 답변을 부른 질문과 짝으로 복사한다.
 * 원본 세션은 그대로 남아 두 갈래가 각자 이어진다.
 */
export async function branchFromMessage(messageId: string): Promise<{ sessionId?: string; error?: string }> {
  const { userId } = await verifySession();

  const answer = await prisma.aiMessage.findFirst({
    where: { id: messageId, role: 'assistant', session: { userId } },
    select: { id: true, sessionId: true, content: true, sources: true, model: true, createdAt: true },
  });
  if (!answer) return { error: '브랜치할 답변을 찾지 못했습니다.' };

  const question = await prisma.aiMessage.findFirst({
    where: { sessionId: answer.sessionId, role: 'user', createdAt: { lt: answer.createdAt } },
    orderBy: { createdAt: 'desc' },
    select: { content: true, attachments: true },
  });

  const created = await prisma.aiSession.create({
    data: {
      userId,
      model: answer.model ?? DEFAULT_SEARCH_MODEL_ID,
      title: question ? titleFrom(question.content) : '브랜치된 대화',
      messages: {
        create: [
          ...(question
            ? [{ role: 'user', content: question.content, attachments: question.attachments as never }]
            : []),
          { role: 'assistant', content: answer.content, sources: answer.sources as never, model: answer.model },
        ],
      },
    },
    select: { id: true },
  });

  revalidatePath('/study');
  revalidatePath('/study/search');
  return { sessionId: created.id };
}

/** 답변을 법적 문제로 신고한다 — 콘솔의 신고 처리 큐로 들어간다. */
export async function reportAiMessage(formData: FormData): Promise<{ saved?: boolean; error?: string }> {
  const { userId } = await verifySession();
  const messageId = String(formData.get('messageId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 40);
  const detail = String(formData.get('detail') ?? '').trim().slice(0, 1000);
  if (!messageId || !reason) return { error: '신고 사유를 선택해 주세요.' };

  const owned = await prisma.aiMessage.findFirst({
    where: { id: messageId, session: { userId } },
    select: { id: true },
  });
  if (!owned) return { error: '신고할 답변을 찾지 못했습니다.' };

  await prisma.report.create({
    data: { reporterId: userId, targetType: 'ai_message', targetId: messageId, reason, detail: detail || null },
  });
  return { saved: true };
}

/** 현재 세션을 삭제한다(내보내기 후 정리 등). */
export async function deleteSession(formData: FormData): Promise<void> {
  const { userId } = await verifySession();
  const sessionId = String(formData.get('sessionId') ?? '');
  if (!sessionId) return;
  await prisma.aiSession.deleteMany({ where: { id: sessionId, userId } });
  revalidatePath('/study');
  revalidatePath('/study/search');
}
