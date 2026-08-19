import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { createClient } from '@/app/lib/supabase/server';
import { getProviderFor } from '@/app/lib/ai/provider';
import { addFreeAiUsage, estimateTokens, getFreeAiQuota } from '@/app/lib/ai/free-ai';
import { decryptSecret } from '@/app/lib/crypto';
import { rateLimit } from '@/app/lib/rate-limit';
import {
  MAX_ROUNDS as ROUND_CEILING,
  MIN_ROUNDS,
  normalizeInterviewConfig,
} from '@/app/lib/ai/interview-config';
import type { ChatMessage, CodeAnalysis, Language, RoundEval } from '@/app/lib/types';

const answerSchema = z.object({
  answer: z.string().min(1).max(5_000),
  currentCode: z.string().max(50_000).optional(),
});

/** 면접장 입장 전에 고른 설정 — PATCH로 한 번 저장한다. */
const configSchema = z.object({
  rounds: z.number().int().min(MIN_ROUNDS).max(ROUND_CEILING),
  level: z.enum(['easy', 'normal', 'hard']),
  focus: z.enum(['balanced', 'technical', 'code', 'design', 'communication']),
});

export async function POST(request: Request, ctx: RouteContext<'/api/interview/[sessionId]'>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  // LLM 호출 비용 보호 — 사용자당 분당 10회
  if (!rateLimit(`interview:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: '답변 전송이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const { sessionId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const interview = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    include: { submission: { include: { problem: true } } },
  });
  if (!interview || interview.userId !== user.id) {
    return NextResponse.json({ error: '면접 세션을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (interview.status !== 'ACTIVE') {
    return NextResponse.json({ error: '이미 종료된 면접입니다.' }, { status: 409 });
  }

  const { answer, currentCode } = parsed.data;
  const aiConfig = await prisma.user.findUnique({
    where: { id: user.id },
    select: { aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true, aiCodeModel: true, role: true },
  });
  if (aiConfig) {
    aiConfig.aiApiKey = await decryptSecret(aiConfig.aiApiKey);
    aiConfig.aiBaseUrl = await decryptSecret(aiConfig.aiBaseUrl);
  }
  // 디베이트메이트는 Pro Tier 상용 모델을 키 없이 쓸 수 있다
  const aiConfigWithRole = aiConfig;
  // Debate Free AI — 일일 토큰 소진 시 규칙 기반 모델로 자동 전환, 사용 시 토큰 누적
  const usingFreeAi = aiConfig?.aiProvider === 'builtin_ai';
  const freeQuota = usingFreeAi ? await getFreeAiQuota(user.id) : null;
  const ai = getProviderFor(freeQuota?.exhausted ? null : aiConfigWithRole);
  if (usingFreeAi && !freeQuota?.exhausted) {
    addFreeAiUsage(user.id, estimateTokens(parsed.data.answer, parsed.data.currentCode), aiConfig?.aiCodeModel).catch(() => {});
  }
  const problem = interview.submission.problem;
  const problemMeta = {
    id: problem.id,
    title: problem.title,
    category: problem.category,
    difficulty: problem.difficulty,
    keywords: problem.keywords as string[],
  };

  // 입장 전에 고른 설정 — 없으면 기본값(4문항·보통·균형)
  const config = normalizeInterviewConfig(interview.config);
  const maxRounds = config.rounds;

  const messages = (interview.messages as unknown as ChatMessage[]) ?? [];
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'ai')?.content ?? '';
  const round = interview.round;

  // 라이브 리팩터링 인지: 코드가 바뀌었으면 재분석
  const language = interview.submission.language as Language;
  const codeChanged = !!currentCode && currentCode !== interview.submission.code;
  const codeForEval = currentCode ?? interview.submission.code;
  const analysis: CodeAnalysis = codeChanged
    ? ai.analyze(codeForEval, language, problemMeta)
    : ((interview.analysis as unknown as CodeAnalysis) ?? ai.analyze(codeForEval, language, problemMeta));

  // 이번 라운드 답변 평가
  const roundEval = await ai.evaluateAnswer({
    question: lastQuestion,
    answer,
    analysis,
    problem: problemMeta,
    round,
    code: codeForEval,
    config,
  });

  const prevEvals = ((interview.report as unknown as { rounds: RoundEval[] } | null)?.rounds) ?? [];
  const evals = [...prevEvals, roundEval];
  messages.push({ role: 'user', content: answer, round, ts: Date.now() });

  // 종료 조건: 고른 문항 수를 채웠거나, 3라운드 전부 DEFENDED
  const allDefended = evals.length >= 3 && evals.every((e) => e.verdict === 'DEFENDED');
  const isOver = round >= maxRounds || allDefended;

  if (isOver) {
    const report = await ai.finalReport(evals, analysis, problemMeta);
    const closing =
      allDefended && round < maxRounds
        ? '3연속 완벽 방어라 여기서 마치겠습니다. 수고하셨습니다. 리포트를 확인해 주세요.'
        : '면접을 종료합니다. 수고하셨습니다. 방어 성공률 리포트를 확인해 주세요.';
    messages.push({ role: 'ai', content: closing, round, ts: Date.now() });

    await prisma.interviewSession.update({
      where: { id: interview.id },
      data: {
        status: 'COMPLETED',
        messages: messages as object,
        analysis: analysis as object,
        report: report as object,
        defenseScore: report.defenseScore,
        weakKeywords: report.weakKeywords,
      },
    });

    return NextResponse.json({ done: true, evaluation: roundEval, closing, report });
  }

  const nextRound = round + 1;
  const nextQuestion = await ai.nextQuestion({
    analysis,
    problem: problemMeta,
    round: nextRound,
    history: messages,
    seed: interview.submissionId,
    codeChanged,
    code: codeForEval,
    config,
  });
  messages.push({ role: 'ai', content: nextQuestion, round: nextRound, ts: Date.now() });

  await prisma.interviewSession.update({
    where: { id: interview.id },
    data: {
      round: nextRound,
      messages: messages as object,
      analysis: analysis as object,
      report: { rounds: evals } as object,
    },
  });

  return NextResponse.json({
    done: false,
    evaluation: roundEval,
    nextQuestion,
    round: nextRound,
    maxRounds,
  });
}

/**
 * 면접 설정 저장 — "면접장 입장"을 누를 때 한 번 호출한다.
 *
 * 첫 질문은 제출 시점에 이미 만들어져 있어 설정을 반영하지 못한다.
 * 그래서 설정을 저장하면서 첫 질문을 그 경향·난이도로 다시 만든다 —
 * 코드 분석을 고르고 복잡도 질문을 받으면 고른 의미가 없기 때문이다.
 */
export async function PATCH(request: Request, ctx: RouteContext<'/api/interview/[sessionId]'>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { sessionId } = await ctx.params;
  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '잘못된 설정입니다.' }, { status: 400 });

  const interview = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    include: { submission: { include: { problem: true } } },
  });
  if (!interview || interview.userId !== user.id) {
    return NextResponse.json({ error: '면접 세션을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (interview.status !== 'ACTIVE') {
    return NextResponse.json({ error: '이미 종료된 면접입니다.' }, { status: 409 });
  }

  const config = normalizeInterviewConfig(parsed.data);
  const messages = (interview.messages as unknown as ChatMessage[]) ?? [];

  // 아직 답변이 하나도 없을 때만 첫 질문을 다시 만든다 — 진행 중인 면접을 흔들지 않는다
  let firstQuestion: string | null = null;
  if (!messages.some((m) => m.role === 'user')) {
    const aiConfig = await prisma.user.findUnique({
      where: { id: user.id },
      select: { aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true, aiCodeModel: true, role: true },
    });
    if (aiConfig) {
      aiConfig.aiApiKey = await decryptSecret(aiConfig.aiApiKey);
      aiConfig.aiBaseUrl = await decryptSecret(aiConfig.aiBaseUrl);
    }
    const ai = getProviderFor(aiConfig);
    const problem = interview.submission.problem;
    const language = interview.submission.language as Language;
    const problemMeta = {
      id: problem.id,
      title: problem.title,
      category: problem.category,
      difficulty: problem.difficulty,
      keywords: problem.keywords as string[],
    };
    const analysis =
      (interview.analysis as unknown as CodeAnalysis) ??
      ai.analyze(interview.submission.code, language, problemMeta);

    try {
      firstQuestion = await ai.nextQuestion({
        analysis,
        problem: problemMeta,
        round: 1,
        history: [],
        seed: interview.submissionId,
        code: interview.submission.code,
        config,
      });
    } catch {
      // 다시 만들지 못하면 이미 있는 첫 질문을 그대로 쓴다 — 입장을 막을 이유는 없다
      firstQuestion = null;
    }
  }

  await prisma.interviewSession.update({
    where: { id: interview.id },
    data: {
      config: config as object,
      ...(firstQuestion
        ? { messages: [{ role: 'ai', content: firstQuestion, round: 1, ts: Date.now() }] as object }
        : {}),
    },
  });

  return NextResponse.json({ config, firstQuestion });
}
