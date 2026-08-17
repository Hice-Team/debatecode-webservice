import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { createClient } from '@/app/lib/supabase/server';
import { getProviderFor } from '@/app/lib/ai/provider';
import { decryptSecret } from '@/app/lib/crypto';
import { rateLimit } from '@/app/lib/rate-limit';
import type { ChatMessage, Language } from '@/app/lib/types';

const submissionSchema = z.object({
  problemId: z.number().int().positive(),
  code: z.string().min(1).max(50_000),
  language: z.enum(['javascript', 'python']),
  status: z.enum(['PASS', 'FAIL', 'ERROR', 'TIMEOUT']),
  passedCount: z.number().int().min(0),
  totalCount: z.number().int().min(1),
  runtimeMs: z.number().min(0).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!rateLimit(`submit:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: '제출이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const data = parsed.data;
  const problem = await prisma.problem.findUnique({
    where: { id: data.problemId },
    include: { testCases: { select: { id: true } } },
  });
  if (!problem) {
    return NextResponse.json({ error: '존재하지 않는 문제입니다.' }, { status: 404 });
  }
  if (data.totalCount !== problem.testCases.length) {
    return NextResponse.json({ error: '케이스 수가 일치하지 않습니다.' }, { status: 400 });
  }

  const submission = await prisma.submission.create({
    data: {
      userId: user.id,
      problemId: data.problemId,
      code: data.code,
      language: data.language,
      status: data.status,
      passedCount: data.passedCount,
      totalCount: data.totalCount,
      runtimeMs: data.runtimeMs != null ? Math.round(data.runtimeMs) : null,
    },
  });

  // Star 점수의 풀이 축: 정답률(최대 35)과 난이도/효율(최대 15)을 제출마다
  // 누적한다. 면접 축은 면접 종료 시 방어 점수로 추가되도록 분리한다.
  const solvePoints = Math.round((data.passedCount / data.totalCount) * 35 + (data.status === 'PASS' ? problem.difficulty * 3.75 : 0));
  if (solvePoints > 0) {
    await prisma.user.update({ where: { id: user.id }, data: { starScore: { increment: solvePoints } } });
  }

  // 전체 통과 시에만 면접 세션 생성
  if (data.status !== 'PASS' || data.passedCount !== data.totalCount) {
    return NextResponse.json({ submissionId: submission.id });
  }

  const aiConfig = await prisma.user.findUnique({
    where: { id: user.id },
    select: { aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true },
  });
  if (aiConfig) {
    aiConfig.aiApiKey = await decryptSecret(aiConfig.aiApiKey);
    aiConfig.aiBaseUrl = await decryptSecret(aiConfig.aiBaseUrl);
  }
  const ai = getProviderFor(aiConfig);
  const problemMeta = {
    id: problem.id,
    title: problem.title,
    category: problem.category,
    difficulty: problem.difficulty,
    keywords: problem.keywords as string[],
  };
  const analysis = ai.analyze(data.code, data.language as Language, problemMeta);
  const firstQuestion = await ai.nextQuestion({
    analysis,
    problem: problemMeta,
    round: 1,
    history: [],
    seed: submission.id,
    code: data.code,
  });

  const messages: ChatMessage[] = [
    { role: 'ai', content: firstQuestion, round: 1, ts: Date.now() },
  ];

  const interview = await prisma.interviewSession.create({
    data: {
      submissionId: submission.id,
      userId: user.id,
      status: 'ACTIVE',
      round: 1,
      messages: messages as object,
      analysis: analysis as object,
    },
  });

  return NextResponse.json({
    submissionId: submission.id,
    interviewSessionId: interview.id,
    firstQuestion,
  });
}
