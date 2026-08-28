import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { getApiSession } from '@/app/lib/dal';
import { verifyJudgeSession, type CaseOutcome } from '@/app/lib/judge/server';
import { normalizeOutput } from '@/app/lib/judge/compare';
import { getProviderFor } from '@/app/lib/ai/provider';
import { decryptSecret } from '@/app/lib/crypto';
import { isEnabled } from '@/app/lib/settings';
import { POINT_KINDS, grantPoints, solvePoints } from '@/app/lib/points';
import type { ChatMessage, Language } from '@/app/lib/types';

// POST /api/judge/verify — 브라우저가 만든 출력을 서버가 채점한다.
//
// 요청 본문에 pass/fail도, 통과 개수도 들어오지 않는다. 그건 서버가 정한다.
// 들어오는 것은 "각 케이스에서 코드가 무엇을 돌려주었는가"뿐이다.
const outcomeSchema = z.object({
  id: z.number().int(),
  outcome: z.enum(['returned', 'error', 'timeout']),
  // 사용자 코드의 반환값 — 어떤 모양이든 올 수 있다. 크기는 아래에서 좁힌다.
  actual: z.unknown().optional(),
  stdout: z.string().max(20_000).optional(),
  timeMs: z.number().optional(),
  errorMessage: z.string().max(2_000).optional(),
});

const schema = z.object({
  sessionId: z.string().min(1).max(64),
  code: z.string().min(1).max(50_000),
  outcomes: z.array(outcomeSchema).min(1).max(200),
});

export async function POST(request: Request) {
  const session = await getApiSession();
  const userId = session?.userId ?? null;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const outcomes: CaseOutcome[] = parsed.data.outcomes.map((o) => ({
    ...o,
    actual: o.outcome === 'returned' ? normalizeOutput(o.actual) : undefined,
  }));

  const result = await verifyJudgeSession({
    sessionId: parsed.data.sessionId,
    userId,
    code: parsed.data.code,
    outcomes,
  });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { verdict, problem, language, kind } = result.judged;

  // 비로그인 실행 — 판정은 해 주되 남기지 않는다
  if (!userId) return NextResponse.json({ verdict });

  // 시도 기록은 실행·제출 모두 남긴다. 이제 이 값도 서버 판정이다.
  const attempt = await prisma.runAttempt.create({
    data: {
      userId,
      problemId: problem.id,
      code: parsed.data.code,
      language,
      status: verdict.status,
      passedCount: verdict.passed,
      totalCount: verdict.total,
      kind,
    },
    select: { id: true, createdAt: true },
  });

  if (kind === 'run') {
    return NextResponse.json({ verdict, attempt });
  }

  /* ---------- 제출 ---------- */

  const submission = await prisma.submission.create({
    data: {
      userId,
      problemId: problem.id,
      code: parsed.data.code,
      language,
      status: verdict.status,
      passedCount: verdict.passed,
      totalCount: verdict.total,
      runtimeMs: Math.round(verdict.maxTimeMs),
    },
    select: { id: true },
  });

  // Star 점수의 풀이 축: 정답률(최대 35)과 난이도/효율(최대 15)을 제출마다 누적한다.
  // 면접 축은 면접 종료 시 방어 점수로 따로 더한다.
  const starPoints = Math.round(
    (verdict.passed / Math.max(1, verdict.total)) * 35 +
      (verdict.status === 'PASS' ? problem.difficulty * 3.75 : 0),
  );
  if (starPoints > 0) {
    await prisma.user.update({ where: { id: userId }, data: { starScore: { increment: starPoints } } });
  }

  // 디베이트포인트 — 난이도 × 통과율. refId를 문제 id로 두면 원장의 유니크 제약이
  // "같은 문제 재지급"을 막아 준다(app/lib/points.ts).
  const reward = solvePoints(problem.difficulty, verdict.passed, verdict.total);
  if (reward > 0) {
    await grantPoints({
      userId,
      amount: reward,
      kind: POINT_KINDS.problemSolved,
      memo: `${problem.title} 해결 (${verdict.passed}/${verdict.total})`,
      refType: 'problem',
      refId: String(problem.id),
    });
  }

  if (verdict.status !== 'PASS') {
    return NextResponse.json({ verdict, attempt, submissionId: submission.id });
  }

  // 면접 킬 스위치 — 제출·채점은 그대로 두고 AI 면접 진입만 막는다.
  // 여기서 막아야 모델 장애 때 "제출조차 안 되는" 상황이 되지 않는다.
  if (!(await isEnabled('flag.interview'))) {
    return NextResponse.json({ verdict, attempt, submissionId: submission.id, interviewDisabled: true });
  }

  const aiConfig = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true, aiCodeModel: true },
  });
  if (aiConfig) {
    aiConfig.aiApiKey = await decryptSecret(aiConfig.aiApiKey);
    aiConfig.aiBaseUrl = await decryptSecret(aiConfig.aiBaseUrl);
  }

  const problemMeta = {
    id: problem.id,
    title: problem.title,
    category: problem.category,
    difficulty: problem.difficulty,
    keywords: (problem.keywords as string[]) ?? [],
  };

  try {
    const ai = getProviderFor(aiConfig);
    const analysis = ai.analyze(parsed.data.code, language as Language, problemMeta);
    const firstQuestion = await ai.nextQuestion({
      analysis,
      problem: problemMeta,
      round: 1,
      history: [],
      seed: submission.id,
      code: parsed.data.code,
    });

    const messages: ChatMessage[] = [{ role: 'ai', content: firstQuestion, round: 1, ts: Date.now() }];
    const interview = await prisma.interviewSession.create({
      data: {
        submissionId: submission.id,
        userId,
        status: 'ACTIVE',
        round: 1,
        messages: messages as object,
        analysis: analysis as object,
      },
      select: { id: true },
    });

    return NextResponse.json({
      verdict,
      attempt,
      submissionId: submission.id,
      interviewSessionId: interview.id,
      firstQuestion,
    });
  } catch {
    // 면접 준비가 실패해도 제출은 이미 성공했다. 통과 사실까지 되돌리지 않는다.
    return NextResponse.json({ verdict, attempt, submissionId: submission.id, interviewDisabled: true });
  }
}
