import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { createClient } from '@/app/lib/supabase/server';
import { rateLimit } from '@/app/lib/rate-limit';
import { getBuiltinProvider, getBuiltinLlmConfig } from '@/app/lib/ai/builtin';

// 리팩토링모드는 모델 선택 없이 내장 모델로 돈다 — 사용량 내역에서도 한 줄로 묶어 보여 준다
const REFACTOR_USAGE_MODEL = 'builtin-refactor';
import { addFreeAiUsage, estimateTokens, getFreeAiQuota } from '@/app/lib/ai/free-ai';
import { getProviderFor } from '@/app/lib/ai/provider';
import { llmChat } from '@/app/lib/ai/llm-interviewer';
import { extractPromptHistory, promptQuestion, totalPromptRounds } from '@/app/lib/debateq-prompts';
import type { ChatMessage, CodeRecord, Language, RoundEval } from '@/app/lib/types';

// debateQ 라운드 — 사용자는 생성형 AI에게 "프롬프트(명령)"를 내려 코드를 작성/수정하고(command),
// 전체 통과 후에는 입력했던 프롬프트를 순서대로 되짚는 면접에 답해(answer)
// 프롬프트 구사력과 설명 능력을 종합 평가받는다. 응답 계약은 /api/interview와 동일.
const MAX_ROUNDS = 4;

const roundSchema = z.object({
  mode: z.enum(['answer', 'command']).default('answer'),
  answer: z.string().min(1).max(5_000),
  currentCode: z.string().min(1).max(50_000),
});

const COMMAND_SYSTEM = `당신은 debateQ의 코딩 어시스턴트입니다. 사용자는 코드를 직접 수정할 수 없고,
오직 당신에게 명령을 내려 코드를 작성/수정합니다. 주어진 현재 코드에 사용자의 지시를 반영한 전체 코드를 작성하세요.
지시가 모호하면 합리적으로 해석하되 지시 범위를 벗어난 변경은 하지 마세요.
다음 JSON 형식으로만 답하세요: {"code": "<수정된 전체 코드>", "note": "<무엇을 어떻게 바꿨는지 1~2문장>"}`;

function extractJson(text: string): { code?: string; note?: string } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function POST(request: Request, ctx: RouteContext<'/api/debateq/[sessionId]'>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  if (!rateLimit(`debateq:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: '답변 전송이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const { sessionId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = roundSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const session = await prisma.debateQSession.findUnique({
    where: { id: sessionId },
    include: { problem: true },
  });
  if (!session || session.userId !== user.id) {
    return NextResponse.json({ error: 'debateQ 세션을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (session.status !== 'ACTIVE') {
    return NextResponse.json({ error: '이미 종료된 세션입니다.' }, { status: 409 });
  }

  const { mode, answer, currentCode } = parsed.data;

  // Debate Free AI 일일 쿠터 — 소진 시 명령 모드는 차단, 면접 평가는 규칙 기반으로 전환
  const freeQuota = await getFreeAiQuota(user.id);

  // ---- 명령 모드: AI에게 지시해 코드를 작성/수정 (라운드 미소모) ----
  if (mode === 'command') {
    if (freeQuota.exhausted) {
      return NextResponse.json(
        {
          error: `오늘의 Debate Free AI 토큰을 모두 사용했습니다. ${
            freeQuota.resetAt ? freeQuota.resetAt.toLocaleString('ko-KR') : '24시간 후'
          }에 초기화됩니다.`,
        },
        { status: 429 },
      );
    }
    const llmConfig = getBuiltinLlmConfig();
    if (!llmConfig) {
      return NextResponse.json(
        { error: '실모델(debateAI)이 설정되지 않아 명령 모드를 쓸 수 없습니다. 코드를 직접 수정해 주세요.' },
        { status: 503 },
      );
    }
    try {
      const reply = await llmChat(
        llmConfig,
        COMMAND_SYSTEM,
        `문제: ${session.problem.title}\n언어: ${session.language}\n\n현재 코드:\n\`\`\`\n${session.currentCode}\n\`\`\`\n\n사용자 명령: ${answer}`,
      );
      const parsedReply = extractJson(reply);
      if (!parsedReply?.code || parsedReply.code.trim().length < 10) {
        return NextResponse.json({ error: 'AI가 코드를 생성하지 못했습니다. 명령을 더 구체적으로 내려보세요.' }, { status: 502 });
      }
      addFreeAiUsage(user.id, estimateTokens(session.currentCode, answer, reply), REFACTOR_USAGE_MODEL).catch(() => {});
      const messages0 = (session.messages as unknown as ChatMessage[]) ?? [];
      messages0.push({ role: 'user', content: `[명령] ${answer}`, round: session.round, ts: Date.now() });
      messages0.push({ role: 'ai', content: parsedReply.note || '지시하신 대로 코드를 수정했습니다.', round: session.round, ts: Date.now() });
      // 모든 코드 버전을 기록 — 시도횟수 탭에서 열람한다
      const history = (session.codeHistory as unknown as CodeRecord[]) ?? [];
      history.push({ code: parsedReply.code, note: parsedReply.note ?? '', ts: Date.now() });
      await prisma.debateQSession.update({
        where: { id: session.id },
        data: { currentCode: parsedReply.code, messages: messages0 as object, codeHistory: history as object },
      });
      return NextResponse.json({ done: false, command: true, code: parsedReply.code, note: parsedReply.note ?? '' });
    } catch {
      return NextResponse.json({ error: 'AI 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
    }
  }

  // ---- 설명(변론) 모드 ----
  const codeChanged = currentCode !== session.initialCode;

  // 코드 작업이 전혀 없으면 라운드를 소모하지 않고 되돌려준다 — debateQ는 "코드 작성+설명"이 한 세트
  if (!codeChanged && session.currentCode === session.initialCode) {
    return NextResponse.json(
      { error: '아직 코드가 작성되지 않았습니다. AI에게 명령해 코드를 만든 뒤 설명과 함께 제출해 주세요.' },
      { status: 422 },
    );
  }

  // 쿠터 소진 시 규칙 기반 모델로 자동 전환 — 평가는 계속 진행된다
  const ai = freeQuota.exhausted ? getProviderFor(null) : getBuiltinProvider();
  if (!freeQuota.exhausted) addFreeAiUsage(user.id, estimateTokens(answer, currentCode), REFACTOR_USAGE_MODEL).catch(() => {});
  const language = session.language as Language;
  const problemMeta = {
    id: session.problem.id,
    title: session.problem.title,
    category: session.problem.category,
    difficulty: session.problem.difficulty,
    keywords: session.problem.keywords as string[],
  };

  const messages = (session.messages as unknown as ChatMessage[]) ?? [];
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'ai')?.content ?? '';
  const round = session.round;
  const flawHints = (session.flawHints as unknown as string[]) ?? [];

  const analysis = ai.analyze(currentCode, language, problemMeta);

  // 프롬프트 면접 — 사용자가 입력한 프롬프트(명령)를 순서대로 되짚는다.
  // 프롬프트가 하나도 없으면(직접 수정 폴백) 기존 결함-변론 흐름을 유지한다.
  const prompts = extractPromptHistory(messages);
  const totalRounds = totalPromptRounds(prompts);
  const question = prompts.length
    ? `${promptQuestion(prompts, round)}\n[프롬프트 면접 — 프롬프트의 명확성·의도와 설명 능력을 심사]`
    : `${lastQuestion}\n[출제 결함 힌트: ${flawHints.join(' / ') || '없음'}]`;

  const roundEval = await ai.evaluateAnswer({
    question,
    answer,
    analysis,
    problem: problemMeta,
    round,
    code: currentCode,
  });

  // 1라운드 프롬프트 질문은 클라이언트가 전환 시점에 표시한다 — 재개를 위해 기록에도 남긴다
  if (round === 1 && prompts.length > 0 && !messages.some((m) => m.role === 'ai' && m.content.includes(prompts[0]))) {
    messages.push({ role: 'ai', content: promptQuestion(prompts, 1), round, ts: Date.now() });
  }

  const prevEvals = ((session.report as unknown as { rounds: RoundEval[] } | null)?.rounds) ?? [];
  const evals = [...prevEvals, roundEval];
  messages.push({ role: 'user', content: answer, round, ts: Date.now() });

  // 폴백(직접 수정) 코드도 빠짐없이 기록한다
  const codeHistory = (session.codeHistory as unknown as CodeRecord[]) ?? [];
  if (currentCode !== session.currentCode) {
    codeHistory.push({ code: currentCode, note: '설명 제출 시점의 코드 (직접 수정)', ts: Date.now() });
  }

  const allDefended = prompts.length === 0 && evals.length >= 3 && evals.every((e) => e.verdict === 'DEFENDED');
  const isOver = round >= totalRounds || allDefended;

  if (isOver) {
    const report = await ai.finalReport(evals, analysis, problemMeta);
    const closing = prompts.length
      ? '프롬프트 면접이 끝났습니다. 각 프롬프트의 구사력과 설명 능력을 종합한 리포트를 확인해 주세요.'
      : allDefended && round < MAX_ROUNDS
        ? '결함을 완벽히 방어하며 수정하셨습니다. debateQ를 종료합니다 — 리포트를 확인해 주세요.'
        : 'debateQ를 종료합니다. 수정 과정 리포트를 확인해 주세요.';
    messages.push({ role: 'ai', content: closing, round, ts: Date.now() });

    await prisma.debateQSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        currentCode,
        messages: messages as object,
        report: report as object,
        score: report.defenseScore,
        codeHistory: codeHistory as object,
      },
    });
    return NextResponse.json({ done: true, evaluation: roundEval, closing, report });
  }

  const nextRound = round + 1;
  const nextQuestion = prompts.length
    ? promptQuestion(prompts, nextRound)
    : await ai.nextQuestion({
        analysis,
        problem: problemMeta,
        round: nextRound,
        history: messages,
        seed: session.id,
        codeChanged,
        code: currentCode,
      });
  messages.push({ role: 'ai', content: nextQuestion, round: nextRound, ts: Date.now() });

  await prisma.debateQSession.update({
    where: { id: session.id },
    data: {
      round: nextRound,
      currentCode,
      messages: messages as object,
      report: { rounds: evals } as object,
      codeHistory: codeHistory as object,
    },
  });

  return NextResponse.json({ done: false, evaluation: roundEval, nextQuestion, round: nextRound, maxRounds: totalRounds });
}

// 실행(채점) 시도 기록 — 워크스페이스의 실행 버튼마다 호출되어 횟수를 누적한다.
export async function PATCH(_request: Request, ctx: RouteContext<'/api/debateq/[sessionId]'>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { sessionId } = await ctx.params;
  const session = await prisma.debateQSession.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });
  if (!session || session.userId !== user.id) {
    return NextResponse.json({ error: 'debateQ 세션을 찾을 수 없습니다.' }, { status: 404 });
  }

  const updated = await prisma.debateQSession.update({
    where: { id: sessionId },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });
  return NextResponse.json({ attempts: updated.attempts });
}
