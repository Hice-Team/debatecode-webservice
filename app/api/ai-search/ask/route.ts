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
import { requireApiSession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { rateLimit } from '@/app/lib/rate-limit';
import { decryptSecret } from '@/app/lib/crypto';
import { consumeAiUsage, exhaustedMessage, refundAiUsage } from '@/app/lib/ai/usage-limits';
import { featureBlockMessage, getLimit } from '@/app/lib/settings';
import { DEFAULT_SEARCH_MODEL_ID, findSearchModel, isSearchModelId } from '@/app/lib/ai/search-models';
import { fallbackAnswer, getSearchLlmConfig, streamSearchAnswer } from '@/app/lib/ai/search-answerer';
import { hasOwnFunding } from '@/app/lib/ai/funding';
import { EFFORTS, asEffort } from '@/app/lib/ai/effort';
import { estimateTokens } from '@/app/lib/ai/free-ai';
import { buildAttachmentContext } from '@/app/lib/ai/attachment-context';
import { isAttachmentProxyUrl } from '@/app/lib/storage';
import {
  DEFAULT_CONTEXT_MODE,
  contextTurns,
  isContextMode,
  parseInstructions,
} from '@/app/lib/user-prefs';

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
        name: z.string().max(400),
        // 두 가지만 허용한다.
        //   ① 우리 스토리지를 가리키는 내부 프록시 주소 (/api/ai-search/file?path=…)
        //   ② 외부 http(s) 주소 (URL 첨부)
        // 예전에는 ②만 통과시켰는데 업로드는 전부 ①이라, 파일을 붙인 질문이 통째로
        // 400으로 떨어졌다. 화면에는 "첨부 업로드에 실패했습니다"만 떠서 원인을 볼 수 없었다.
        // javascript:/data: 같은 스킴은 계속 막는다.
        url: z
          .string()
          .max(2000)
          .refine(
            (value) => isAttachmentProxyUrl(value) || /^https?:\/\//i.test(value),
            '첨부 주소를 확인해 주세요.',
          ),
        mime: z.string().max(120).optional(),
        size: z.number().nonnegative().optional(),
        source: z.string().max(40).optional(),
        preview: z.string().max(2000).optional(),
        // 한 덩어리로 가져온 것들의 이름(저장소·프로젝트). 대화 기록에서도 칩 하나로 묶인다.
        group: z.string().max(200).optional(),
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
  // 로그인 필수 — 401 JSON으로 답한다. verifySession()은 /login으로 리다이렉트하는데,
  // API에서 그러면 fetch가 로그인 페이지 HTML을 받아 "JSON 파싱 실패"로 보인다.
  const session = await requireApiSession();
  if ('response' in session) return session.response;
  const { userId } = session;

  // 운영 킬 스위치 — 업스트림 장애나 비용 급증 시 콘솔에서 끈다
  const blocked = await featureBlockMessage('flag.ai_search');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 503 });

  // 분당 연타 방어 — 한도는 런타임 설정에서 읽는다(재배포 없이 조인다)
  if (!rateLimit(`ai-search:${userId}`, await getLimit('limit.rate.ai_ask'), 60_000)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  // 이용자 AI 설정 — 개인 키가 있으면 그 키로 부르고 한도를 걸지 않는다.
  const aiRow = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true,
      aiInstructions: true, aiContextMode: true, chatLanguage: true, aiSearchModel: true,
    },
  });
  const userKeys = {
    provider: aiRow?.aiProvider ?? 'builtin_ai',
    model: aiRow?.aiModel ?? null,
    apiKey: await decryptSecret(aiRow?.aiApiKey),
    baseUrl: await decryptSecret(aiRow?.aiBaseUrl),
  };
  const serviceFunded = !hasOwnFunding(userKeys);
  const defaultSearchModel = isSearchModelId(aiRow?.aiSearchModel)
    ? aiRow.aiSearchModel
    : DEFAULT_SEARCH_MODEL_ID;

  // 설정 › AI에서 정한 답변 방식 — 지침, 함께 보낼 대화의 양, 답할 언어
  const instructions = parseInstructions(aiRow?.aiInstructions);
  const historyTurns = contextTurns(
    isContextMode(aiRow?.aiContextMode) ? aiRow.aiContextMode : DEFAULT_CONTEXT_MODE,
  );
  const answerLanguage =
    aiRow?.chatLanguage === 'ko' || aiRow?.chatLanguage === 'en' ? aiRow.chatLanguage : undefined;

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

  // 하루 15회 — 실제로 물어볼 질문이 확정된 뒤에 센다.
  // 잘못된 요청이나 찾지 못한 답변 때문에 이용자의 하루 횟수가 줄어들면 안 된다.
  // 모델이 답하지 못한 경우는 아래에서 되돌린다.
  const allowance = await consumeAiUsage({ userId, surface: 'ai-search', serviceFunded });
  if (allowance.exhausted) {
    return NextResponse.json(
      { error: exhaustedMessage('ai-search', allowance.resetAt), code: 'quota_exhausted' },
      { status: 429 },
    );
  }

  if (!sessionId) {
    // 세션 없이 들어온 질문은 **새 대화**를 연다. 예전에는 가장 최근 세션에 이어 붙였는데,
    // 그러면 관계없는 질문이 지난 대화의 맥락을 물려받아 답이 엉뚱해졌다.
    // 아직 아무 말도 오가지 않은 세션이 있으면 그것을 쓴다 — 빈 세션이 쌓이지 않도록.
    const empty = await prisma.aiSession.findFirst({
      where: { userId, messages: { none: {} } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    sessionId =
      empty?.id ??
      // 새 대화는 설정에서 고른 기본 모델로 연다 — 매번 다시 고르지 않게
      (await prisma.aiSession.create({ data: { userId, model: defaultSearchModel } })).id;
  }

  const sessionRow = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    select: { model: true, effort: true },
  });
  const modelId = isSearchModelId(parsed.data.model)
    ? parsed.data.model
    : (sessionRow?.model ?? defaultSearchModel);
  const model = findSearchModel(modelId);
  // 강도도 모델처럼 세션에 기억된다 — 매번 다시 고르게 하지 않는다
  const effort = asEffort(parsed.data.effort ?? sessionRow?.effort);

  // 첨부 원문을 읽어 프롬프트에 실을 블록으로 만든다.
  //
  // 스트림 콜백 안이 아니라 여기서 읽는 이유가 있다. 스토리지를 부르는 클라이언트는
  // 쿠키에서 세션을 꺼내는데(RLS로 남의 파일을 막는 장치다), 응답이 흐르기 시작한 뒤에는
  // 요청 스코프가 살아 있다고 보장할 수 없다. 첫 바이트가 조금 늦더라도 여기서 끝낸다.
  //
  // 실패해도 질문 자체는 계속 간다 — 첨부 하나 때문에 대화가 끊기면 안 된다.
  // 그림은 고른 모델이 볼 수 있을 때만 실어 보낸다. 못 보는 모델에 보내면 요청이
  // 거절되거나, 더 나쁘게는 조용히 무시된 채 "봤다"는 듯이 답한다.
  const attachmentContext = await buildAttachmentContext(attachments, userId, model.vision === true).catch(() => ({
    text: '',
    read: 0,
    listed: attachments.length,
    images: [] as string[],
  }));

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
        step(
          'receive',
          'done',
          [
            `맥락 ${Math.min(history.length, 8)}턴`,
            // 몇 개를 실제로 읽었는지 화면에 남긴다 — 첨부가 조용히 무시되면 알 길이 없다
            attachments.length > 0
              ? [
                  `첨부 ${attachments.length}개 중 ${attachmentContext.read}개 읽음`,
                  attachmentContext.images.length > 0 ? `그림 ${attachmentContext.images.length}장 전달` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '',
          ]
            .filter(Boolean)
            .join(' · '),
        );

        // ② 모델 연결 → ③ 추론 → ④ 답변 생성
        //    각 단계는 첫 토큰이 실제로 도착한 시점에 전환한다.
        let answer = '';
        let live = false;
        let aborted = false;
        let reasoningChars = 0;
        // 공급자가 usage를 주면 실측, 안 주면 아래에서 추정치로 채운다
        let usage: { promptTokens?: number; completionTokens?: number } | null = null;

        if (!getSearchLlmConfig(modelId, userKeys)) {
          step('dispatch', 'done', '모델 미연결');
          answer = fallbackAnswer('no-key');
          // 부를 모델이 없었다 — 이번 호출은 없던 것으로 한다
          void refundAiUsage({ userId, surface: 'ai-search', serviceFunded });
        } else {
          step('dispatch', 'running', `${model.label} · ${model.repo}`);
          let dispatched = false;
          let reasoningOpen = false;
          let composing = false;
          try {
            for await (const chunk of streamSearchAnswer({
              question,
              history: history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
              attachmentContext: attachmentContext.text,
              attachmentImages: attachmentContext.images,
              modelId,
              effort,
              user: userKeys,
              instructions,
              historyTurns,
              answerLanguage,
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
            if (!live) {
              answer = fallbackAnswer('failed');
              void refundAiUsage({ userId, surface: 'ai-search', serviceFunded });
            }
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
              void refundAiUsage({ userId, surface: 'ai-search', serviceFunded });
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
          // 오늘 남은 대화 수 — 다 쓴 뒤에 알려 주면 늦다
          allowance: allowance.unlimited
            ? { unlimited: true as const }
            : { unlimited: false as const, remaining: allowance.remaining, limit: allowance.limit },
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
