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
export async function listSessions(limit = 60) {
  const { userId } = await verifySession();
  return prisma.aiSession.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      model: true,
      folderId: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
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
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        // 내가 남긴 평가를 함께 싣는다 — 없으면 빈 배열이라 메시지가 누락되지는 않는다
        include: { feedback: { where: { userId }, select: { rating: true, reasons: true, comment: true } } },
      },
    },
  });
  return session;
}

/**
 * 새 대화 시작 — 빈 세션을 하나 더 만든다.
 * 이전 세션은 목록에 그대로 남으므로 언제든 다시 열 수 있다.
 * 빈 세션이 쌓이지 않도록, 메시지가 없는 세션이 이미 있으면 그것을 재사용한다.
 */
async function openNewSession(model?: string): Promise<{ sessionId: string }> {
  const { userId } = await verifySession();
  const chosen = isSearchModelId(model) ? model : DEFAULT_SEARCH_MODEL_ID;

  const empty = await prisma.aiSession.findFirst({
    where: { userId, messages: { none: {} } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  if (empty) {
    await prisma.aiSession.update({ where: { id: empty.id }, data: { model: chosen, updatedAt: new Date() } });
    return { sessionId: empty.id };
  }

  const created = await prisma.aiSession.create({ data: { userId, model: chosen } });
  return { sessionId: created.id };
}

export async function startNewSession(model?: string): Promise<{ sessionId: string }> {
  const result = await openNewSession(model);
  revalidatePath('/study');
  revalidatePath('/study/search');
  return result;
}

/**
 * 세션 없이 들어왔을 때 쓸 세션 — **언제나 새 대화**다.
 *
 * 예전에는 가장 최근 세션을 이어받았다. 그래서 AI Search를 열 때마다 지난 대화가
 * 그대로 이어졌고, 사실상 이용자 한 명에 대화 하나만 존재하는 것처럼 굴었다.
 * 지난 대화는 사이드바에서 골라 들어가고, 그냥 들어오면 빈 화면에서 시작한다.
 *
 * 빈 세션까지 새로 만들지는 않는다 — 화면을 새로 고칠 때마다 아무 말도 없는 세션이
 * 목록에 쌓이면 사이드바가 껍데기로 덮인다.
 *
 * startNewSession이 아니라 openNewSession을 부르는 이유가 있다. 이 함수는 **페이지가
 * 그려지는 도중에** 불린다(app/study/search/page.tsx). 그 시점에 revalidatePath를
 * 호출하면 Next가 렌더 중 캐시 무효화를 막아 페이지가 통째로 실패한다 — 화면에는
 * 입력창은커녕 아무것도 남지 않는다.
 */
export async function ensureSession(): Promise<{ sessionId: string }> {
  return openNewSession();
}

/**
 * 답변 하나를 시작점으로 새 대화를 연다 — 응답 툴바의 "새 채팅에서 브랜치 생성".
 *
 * 예전에는 그 답변과 바로 앞 질문 **한 쌍만** 옮겼다. 그러면 새 대화에서 이어 물을 때
 * 앞선 맥락이 통째로 빠져 있어, 모델이 이미 정리한 전제를 처음부터 다시 설명해야 했다.
 * 분기의 목적은 "여기까지는 그대로 두고 여기서부터 다르게 가 보기"이므로,
 * 그 답변까지의 대화 전체를 복사한다.
 *
 * 원본 세션은 그대로 남아 두 갈래가 각자 이어진다.
 */
export async function branchFromMessage(messageId: string): Promise<{ sessionId?: string; error?: string }> {
  const { userId } = await verifySession();

  const answer = await prisma.aiMessage.findFirst({
    where: { id: messageId, role: 'assistant', session: { userId } },
    select: { id: true, sessionId: true, createdAt: true, model: true, session: { select: { title: true, effort: true } } },
  });
  if (!answer) return { error: '브랜치할 답변을 찾지 못했습니다.' };

  // 그 답변까지의 모든 메시지 — 분기 지점 이후는 가져오지 않는다
  const history = await prisma.aiMessage.findMany({
    where: { sessionId: answer.sessionId, createdAt: { lte: answer.createdAt } },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, attachments: true, sources: true, model: true, effort: true },
  });
  if (history.length === 0) return { error: '브랜치할 대화를 찾지 못했습니다.' };

  const firstQuestion = history.find((m) => m.role === 'user');
  const copiedAt = Date.now();

  const created = await prisma.aiSession.create({
    data: {
      userId,
      model: answer.model ?? DEFAULT_SEARCH_MODEL_ID,
      effort: answer.session.effort,
      title: firstQuestion ? titleFrom(firstQuestion.content) : (answer.session.title ?? '브랜치된 대화'),
      branchedFrom: {
        sessionId: answer.sessionId,
        title: answer.session.title ?? null,
        messageId: answer.id,
        at: new Date().toISOString(),
      },
      messages: {
        // createdAt을 기본값(now())에 맡기면 한 트랜잭션 안에서 전부 같은 시각이 되어
        // 복원할 때(orderBy createdAt) 순서가 뒤섞인다. 1ms씩 벌려 순서를 고정한다.
        create: history.map((m, i) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments as never,
          sources: m.sources as never,
          model: m.model,
          effort: m.effort,
          createdAt: new Date(copiedAt + i),
        })),
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

  // targetType을 'ai_search'로 맞춘다. 예전 'ai_message'는 콘솔 신고 큐의 대상 목록에 없어서
  // 접수는 되는데 화면에 잡히지 않았다 — 사실상 사라지는 신고였다.
  // dedupeKey도 함께 채워야 케이스 단위 트리아지에 묶인다.
  await prisma.report.create({
    data: {
      reporterId: userId,
      targetType: 'ai_search',
      targetId: messageId,
      reason,
      detail: detail || null,
      dedupeKey: `ai_search:${messageId}`,
    },
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

/* ---------- 폴더 ---------- */

/**
 * 대화 폴더 목록 — 사이드바에 나열한다.
 *
 * 대화가 쌓이면 최근순 목록만으로는 "그때 그 대화"를 찾을 수 없다. 폴더는 이용자가
 * 직접 만드는 묶음이라 자동 분류처럼 엉뚱한 곳에 들어갈 일이 없다.
 */
export async function listFolders() {
  const { userId } = await verifySession();
  return prisma.aiFolder.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, _count: { select: { sessions: true } } },
  });
}

export async function createFolder(formData: FormData): Promise<{ id?: string; error?: string }> {
  const { userId } = await verifySession();
  const name = String(formData.get('name') ?? '').trim().slice(0, 60);
  if (!name) return { error: '폴더 이름을 입력해 주세요.' };

  const folder = await prisma.aiFolder.create({ data: { userId, name } });
  revalidatePath('/study/search');
  return { id: folder.id };
}

export async function renameFolder(formData: FormData): Promise<void> {
  const { userId } = await verifySession();
  const id = String(formData.get('folderId') ?? '');
  const name = String(formData.get('name') ?? '').trim().slice(0, 60);
  if (!id || !name) return;
  await prisma.aiFolder.updateMany({ where: { id, userId }, data: { name } });
  revalidatePath('/study/search');
}

/** 폴더만 지운다 — 안에 있던 대화는 폴더 없는 상태로 남는다(스키마의 SetNull). */
export async function deleteFolder(formData: FormData): Promise<void> {
  const { userId } = await verifySession();
  const id = String(formData.get('folderId') ?? '');
  if (!id) return;
  await prisma.aiFolder.deleteMany({ where: { id, userId } });
  revalidatePath('/study/search');
}

/** 대화를 폴더에 넣거나 뺀다. folderId가 비어 있으면 뺀다. */
export async function moveSessionToFolder(formData: FormData): Promise<void> {
  const { userId } = await verifySession();
  const sessionId = String(formData.get('sessionId') ?? '');
  const folderId = String(formData.get('folderId') ?? '');
  if (!sessionId) return;

  // 남의 폴더로 옮길 수 없다 — 옮길 폴더가 내 것인지 먼저 본다
  if (folderId) {
    const owned = await prisma.aiFolder.findFirst({ where: { id: folderId, userId }, select: { id: true } });
    if (!owned) return;
  }
  await prisma.aiSession.updateMany({
    where: { id: sessionId, userId },
    data: { folderId: folderId || null },
  });
  revalidatePath('/study/search');
}
