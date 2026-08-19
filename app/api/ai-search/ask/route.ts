// AI Search 질의 — 진행 상황과 답변 토큰을 NDJSON으로 흘려보낸다.
//
// 서버 액션(askAiSearch)이 아니라 라우트 핸들러를 쓰는 이유는 하나다.
// 화면의 진행 단계(Stepper)를 "가짜 타이머"가 아니라 실제 파이프라인 시점에 맞추려면
// 응답이 끝나기 전에 중간 상태를 내려보낼 수 있어야 하기 때문이다.
//
// 답변은 DeepSeek 모델이 생성한 것만 그대로 보여준다.
// 예전에 있던 로컬 문서 색인(근거 문서) 계층은 제거했다 — 모델이 답하지 않은 링크를
// 근거처럼 덧붙이면 오히려 출처를 오해하게 만들기 때문이다.
//   대화 계층  세션/메시지 저장     (이 파일)
//   AI 계층    모델 호출·스트리밍   app/lib/ai/search-answerer.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { rateLimit } from '@/app/lib/rate-limit';
import { featureBlockMessage, getLimit } from '@/app/lib/settings';
import { DEFAULT_SEARCH_MODEL_ID, findSearchModel, isSearchModelId } from '@/app/lib/ai/search-models';
import { fallbackAnswer, getSearchLlmConfig, streamSearchAnswer } from '@/app/lib/ai/search-answerer';
import { EFFORTS, asEffort } from '@/app/lib/ai/effort';
import { estimateTokens } from '@/app/lib/ai/free-ai';

const bodySchema = z.object({
  sessionId: z.string().min(1).optional(),
  question: z.string().trim().max(2000, '질문이 너무 깁니다.').optional(),
  /** 이 답변을 지우고 같은 질문으로 다시 생성한다(툴바의 새로고침). */
  regenerateOf: z.string().min(1).optional(),
  model: z.string().optional(),
  effort: z.enum(EFFORTS as [string, ...string[]]).optional(),
  attachments: z
    .array(
      z.object({
        kind: z.enum(['image', 'file', 'link', 'code']),
        name: z.string().max(200),
        // http(s)만 — javascript:/data: 같은 스킴이 첨부 URL로 저장되지 않게 막는다
        url: z.string().url().regex(/^https?:\/\//i, 'http(s) 주소만 첨부할 수 있습니다.'),
        mime: z.string().max(120).optional(),
        size: z.number().nonnegative().optional(),
        source: z.string().max(40).optional(),
        preview: z.string().max(2000).optional(),
      }),
    )
    .max(20)
    .optional(),
});

/** 첫 질문에서 세션 제목을 만든다 — 너무 길면 자른다. */
function titleFrom(question: string): string {
  const clean = question.replace(/\s+/g, ' ').trim();
  return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean;
}

export async function POST(request: Request) {
  const { userId } = await verifySession();

  // 운영 킬 스위치 — 업스트림 장애나 비용 급증 시 콘솔에서 끈다
  const blocked = await featureBlockMessage('flag.ai_search');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 503 });

  // 한도는 런타임 설정에서 읽는다 — 남용이 시작되면 재배포 없이 조인다
  if (!rateLimit(`ai-search:${userId}`, await getLimit('limit.rate.ai_ask'), 60_000)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const first = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0];
    return NextResponse.json({ error: first ?? '요청을 확인해 주세요.' }, { status: 400 });
  }

  const attachments = parsed.data.attachments ?? [];
  const regenerateOf = parsed.data.regenerateOf ?? '';

  // 세션 확보 — 넘어온 id가 내 것이 아니면 무시하고 새로 만든다
  let sessionId = parsed.data.sessionId ?? '';
  if (sessionId) {
    const owned = await prisma.aiSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
    if (!owned) sessionId = '';
  }

  // 재생성 — 지울 답변을 먼저 확인하고, 그 답변이 대답하던 질문을 되살린다.
  // 이 경로에서는 사용자 메시지를 새로 만들지 않는다(질문이 두 번 보이면 안 되므로).
  let question = parsed.data.question ?? '';
  let staleAnswerId = '';
  if (regenerateOf) {
    const target = await prisma.aiMessage.findFirst({
      where: { id: regenerateOf, role: 'assistant', session: { userId } },
      select: { id: true, sessionId: true, createdAt: true },
    });
    if (!target) return NextResponse.json({ error: '다시 생성할 답변을 찾지 못했습니다.' }, { status: 404 });

    const askedBy = await prisma.aiMessage.findFirst({
      where: { sessionId: target.sessionId, role: 'user', createdAt: { lt: target.createdAt } },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });
    if (!askedBy) return NextResponse.json({ error: '원래 질문을 찾지 못했습니다.' }, { status: 404 });

    sessionId = target.sessionId;
    question = askedBy.content;
    staleAnswerId = target.id;
  }

  if (!question) return NextResponse.json({ error: '질문을 입력해 주세요.' }, { status: 400 });

  if (!sessionId) {
    const existing = await prisma.aiSession.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    sessionId = existing?.id ?? (await prisma.aiSession.create({ data: { userId, model: DEFAULT_SEARCH_MODEL_ID } })).id;
  }

  const sessionRow = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    select: { model: true, effort: true },
  });
  const modelId = isSearchModelId(parsed.data.model) ? parsed.data.model : (sessionRow?.model ?? DEFAULT_SEARCH_MODEL_ID);
  const model = findSearchModel(modelId);
  // 강도도 모델처럼 세션에 기억된다 — 매번 다시 고르게 하지 않는다
  const effort = asEffort(parsed.data.effort ?? sessionRow?.effort);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 이용자가 중단하면 클라이언트가 이미 끊긴 뒤라 enqueue가 실패한다.
      // 그래도 서버는 남은 저장 작업을 마쳐야 하므로 전송 실패는 조용히 넘긴다.
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // 연결이 이미 닫힘
        }
      };
      const step = (key: string, status: 'running' | 'done', meta?: string) =>
        send({ type: 'step', key, status, meta });

      try {
        // ① 질의 접수 — 사용자 메시지를 먼저 남긴다(중간에 실패해도 대화가 사라지지 않도록)
        step('receive', 'running');
        // 재생성이면 낡은 답변을 먼저 지운다 — 맥락 조회에 그 답변이 섞이면 안 된다
        if (staleAnswerId) await prisma.aiMessage.delete({ where: { id: staleAnswerId } }).catch(() => {});

        const stored = await prisma.aiMessage.findMany({
          where: { sessionId },
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true },
        });
        // 재생성일 때 마지막 사용자 메시지는 이번 질문 자체이므로 맥락에서 뺀다
        const history = staleAnswerId ? stored.slice(0, -1) : stored;

        if (!staleAnswerId) {
          const userMessage = await prisma.aiMessage.create({
            data: { sessionId, role: 'user', content: question, attachments: attachments as never },
          });
          send({ type: 'user-message', id: userMessage.id, createdAt: userMessage.createdAt.toISOString() });
        }
        step('receive', 'done', `맥락 ${Math.min(history.length, 8)}턴`);

        // ② 모델 연결 → ③ 추론 → ④ 답변 생성
        //    각 단계는 첫 토큰이 실제로 도착한 시점에 전환한다.
        let answer = '';
        let live = false;
        let aborted = false;
        let reasoningChars = 0;
        // 공급자가 usage를 주면 실측, 안 주면 아래에서 추정치로 채운다
        let usage: { promptTokens?: number; completionTokens?: number } | null = null;

        if (!getSearchLlmConfig(modelId)) {
          step('dispatch', 'done', '모델 미연결');
          answer = fallbackAnswer('no-key');
        } else {
          step('dispatch', 'running', `${model.label} · ${model.repo}`);
          let dispatched = false;
          let reasoningOpen = false;
          let composing = false;
          try {
            for await (const chunk of streamSearchAnswer({
              question,
              history: history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
              attachmentNames: attachments.map((a) => a.name),
              modelId,
              effort,
              // 이용자가 중단하거나 브라우저가 연결을 끊으면 모델 호출도 함께 끊는다
              signal: request.signal,
              onUsage: (u) => {
                usage = u;
              },
            })) {
              if (!dispatched) {
                dispatched = true;
                step('dispatch', 'done', '응답 스트림 연결됨');
              }
              if (chunk.kind === 'reasoning') {
                if (!reasoningOpen) {
                  reasoningOpen = true;
                  step('reason', 'running');
                }
                reasoningChars += chunk.text.length;
                send({ type: 'reasoning', text: chunk.text });
                continue;
              }
              if (!composing) {
                composing = true;
                if (reasoningOpen) step('reason', 'done', `${reasoningChars.toLocaleString()}자`);
                step('compose', 'running');
              }
              answer += chunk.text;
              send({ type: 'delta', text: chunk.text });
            }

            if (!dispatched) step('dispatch', 'done', '빈 응답');
            if (reasoningOpen && !composing) step('reason', 'done', `${reasoningChars.toLocaleString()}자`);
            answer = answer.trim();
            live = answer.length > 0;
            if (!live) answer = fallbackAnswer('failed');
          } catch {
            // 중단이면 여기까지 받은 본문을 살려 둔다 — 이용자가 읽던 내용이 사라지면 안 된다
            answer = answer.trim();
            if (answer) {
              aborted = true;
              live = true;
              answer += '\n\n_(생성이 중단되었습니다.)_';
            } else {
              if (!dispatched) step('dispatch', 'done', '호출 실패');
              answer = fallbackAnswer('failed');
            }
          }
        }
        step('compose', 'done', `${answer.length.toLocaleString()}자`);

        // ⑥ 저장 — 답변과 세션 메타를 한 번에 갱신한다.
        //    토큰은 공급자가 준 값이 있으면 그대로, 없으면 추정치를 넣고 그렇다고 표시한다.
        const measured: { promptTokens?: number; completionTokens?: number } | null = usage;
        const tokens = measured ?? {
          promptTokens: estimateTokens(question, ...history.map((m) => m.content)),
          completionTokens: estimateTokens(answer),
        };
        step('store', 'running');
        const saved = await prisma.aiMessage.create({
          data: {
            sessionId,
            role: 'assistant',
            content: answer,
            model: modelId,
            effort,
            promptTokens: tokens.promptTokens ?? null,
            completionTokens: tokens.completionTokens ?? null,
            tokensEstimated: measured === null,
          },
        });
        await prisma.aiSession.update({
          where: { id: sessionId },
          data: {
            updatedAt: new Date(),
            model: modelId,
            effort,
            ...(history.length === 0 ? { title: titleFrom(question) } : {}),
          },
        });
        step('store', 'done');

        send({
          type: 'done',
          sessionId,
          live,
          aborted,
          message: {
            id: saved.id,
            role: 'assistant',
            content: answer,
            createdAt: saved.createdAt.toISOString(),
            attachments: [],
            model: modelId,
            effort,
            promptTokens: saved.promptTokens,
            completionTokens: saved.completionTokens,
            tokensEstimated: saved.tokensEstimated,
          },
        });
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : '답변 생성에 실패했습니다.' });
      } finally {
        try {
          controller.close();
        } catch {
          // 이미 닫힌 스트림
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // 프록시가 버퍼링하면 단계 표시가 한꺼번에 도착해 의미가 없어진다
      'X-Accel-Buffering': 'no',
    },
  });
}
