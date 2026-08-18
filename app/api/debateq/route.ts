import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { createClient } from '@/app/lib/supabase/server';
import { rateLimit } from '@/app/lib/rate-limit';
import { featureBlockMessage } from '@/app/lib/settings';
import { generateFlawedCode } from '@/app/lib/ai/debateq-gen';
import type { Language } from '@/app/lib/types';

// debateQ 세션 재개-또는-생성 — 디베이트메이트(+관리자) 전용.
// 문제집 워크스페이스의 debateQ 토글이 호출한다. 해당 문제의 ACTIVE 세션이 있으면
// 전체 상태를 돌려주고, 없으면 AI가 결함 코드를 생성해 새 세션을 연다.
const createSchema = z.object({
  problemId: z.coerce.number().int().positive(),
  language: z.enum(['javascript', 'python']),
  // true면 언어가 다른 진행 중 세션을 접고(ABANDONED) 요청 언어로 새 세션을 연다
  switchLanguage: z.boolean().optional(),
});

const FIRST_QUESTION =
  '이 코드는 제가(DebateAI) 작성한 초안입니다. 언뜻 동작할 것 같지만 결함이 숨어 있습니다. ' +
  '코드는 직접 수정할 수 없습니다 — 저에게 명령을 내려 코드를 고치고, 실행해 전체 테스트를 통과하면 면접이 시작됩니다.';

type SessionRow = {
  id: string;
  language: string;
  currentCode: string;
  messages: unknown;
  round: number;
  attempts: number;
  codeHistory: unknown;
  status: string;
  report: unknown;
};

function payload(session: SessionRow, resumed: boolean) {
  return {
    sessionId: session.id,
    language: session.language,
    code: session.currentCode,
    messages: session.messages ?? [],
    round: session.round,
    attempts: session.attempts,
    codeHistory: session.codeHistory ?? [],
    completed: session.status === 'COMPLETED',
    report: session.report ?? null,
    resumed,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  // 리팩토링모드는 전 회원 공개 — 계정 존재 여부만 확인한다
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
  if (!dbUser) {
    return NextResponse.json({ error: '계정 정보를 찾을 수 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const { problemId, language, switchLanguage } = parsed.data;

  // 진행 중 세션이 있으면 그대로 재개 (LLM 호출 없음 — 레이트리밋 미적용)
  const existing = await prisma.debateQSession.findFirst({
    where: { userId: user.id, problemId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    // 언어 전환 요청 — 기존 세션을 접고 아래에서 새 언어로 다시 생성한다
    if (switchLanguage && existing.language !== language) {
      await prisma.debateQSession.update({ where: { id: existing.id }, data: { status: 'ABANDONED' } });
    } else {
      return NextResponse.json(payload(existing, true));
    }
  }

  // 운영 킬 스위치 — 새 세션만 막고 진행 중 세션은 그대로 이어진다
  const blocked = await featureBlockMessage('flag.debateq');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 503 });

  // 코드 생성은 LLM 호출 — 사용자당 분당 3회
  if (!rateLimit(`debateq-create:${user.id}`, 3, 60_000)) {
    return NextResponse.json({ error: '세션 생성이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, title: true, category: true, difficulty: true, description: true, keywords: true, starterCodes: true },
  });
  if (!problem) return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 });

  const starterCodes = problem.starterCodes as Record<string, string>;
  const starterCode = starterCodes[language] ?? '';

  const flawed = await generateFlawedCode(
    {
      title: problem.title,
      category: problem.category,
      description: problem.description,
      keywords: problem.keywords as string[],
    },
    language as Language,
    starterCode,
    `${user.id}:${problemId}:${Date.now()}`,
  );

  const session = await prisma.debateQSession.create({
    data: {
      userId: user.id,
      problemId,
      language,
      initialCode: flawed.code,
      currentCode: flawed.code,
      flawHints: flawed.flawHints,
      messages: [{ role: 'ai', content: FIRST_QUESTION, round: 1, ts: Date.now() }] as object,
      codeHistory: [{ code: flawed.code, note: '초기 코드 — AI가 생성한 초안', ts: Date.now() }] as object,
    },
  });

  return NextResponse.json(payload(session, false));
}
