import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { createClient } from '@/app/lib/supabase/server';

// debateAI 대화 저장소 — 이용자·문제당 하나(DebateAiChat).
//
//   GET     ?problemId=  이어서 볼 대화를 불러온다
//   PUT                  대화 전체를 덮어쓴다 (턴이 끝날 때마다 호출)
//   DELETE  ?problemId=  초기화
//
// 비로그인 이용자는 저장하지 않는다 — 화면 안에서만 이어진다.
// 서버 응답은 항상 200/204로 단순하게 두어, 저장 실패가 대화를 끊지 않게 한다.

const MAX_MESSAGES = 60;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(20_000),
  command: z.boolean().optional(),
});

/** 대화 줄기 — 리팩토링모드는 "AI의 결함 코드"를 전제로 해 학습 대화와 문맥이 다르다 */
const scopeSchema = z.enum(['general', 'refactor']).default('general');

const putSchema = z.object({
  problemId: z.number().int().positive(),
  scope: scopeSchema,
  messages: z.array(messageSchema).max(MAX_MESSAGES),
  model: z.string().max(64).optional(),
});

function readScope(url: URL): 'general' | 'refactor' {
  return url.searchParams.get('scope') === 'refactor' ? 'refactor' : 'general';
}

async function currentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ messages: [], model: null, existed: false });

  const url = new URL(request.url);
  const problemId = Number(url.searchParams.get('problemId'));
  if (!Number.isInteger(problemId) || problemId <= 0) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const chat = await prisma.debateAiChat.findUnique({
    where: { userId_problemId_scope: { userId, problemId, scope: readScope(url) } },
    select: { messages: true, model: true, updatedAt: true },
  });
  if (!chat) return NextResponse.json({ messages: [], model: null, existed: false });

  const messages = z.array(messageSchema).safeParse(chat.messages);
  return NextResponse.json({
    messages: messages.success ? messages.data : [],
    model: chat.model,
    updatedAt: chat.updatedAt.toISOString(),
    // 이어서 볼 대화가 실제로 있었는지 — 화면의 "이전 대화" 배너 판단에 쓴다
    existed: messages.success && messages.data.length > 0,
  });
}

export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) return new NextResponse(null, { status: 204 });

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const { problemId, model, scope } = parsed.data;
  // 최근 것부터 남긴다 — 오래된 앞부분이 잘려도 이어지는 대화가 우선이다
  const messages = parsed.data.messages.slice(-MAX_MESSAGES);

  try {
    await prisma.debateAiChat.upsert({
      where: { userId_problemId_scope: { userId, problemId, scope } },
      create: { userId, problemId, scope, messages, model },
      update: { messages, model },
    });
  } catch {
    // 문제가 지워졌거나 저장에 실패해도 진행 중인 대화를 끊지 않는다
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return new NextResponse(null, { status: 204 });

  const url = new URL(request.url);
  const problemId = Number(url.searchParams.get('problemId'));
  if (!Number.isInteger(problemId) || problemId <= 0) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  await prisma.debateAiChat.deleteMany({ where: { userId, problemId, scope: readScope(url) } });
  return new NextResponse(null, { status: 204 });
}
