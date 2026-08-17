// 세션 메시지 다시 읽기 — 대화 화면이 서버에 저장된 상태로 되맞출 때 쓴다.
//
// 생성을 중단하면 클라이언트는 스트림을 끊어 `done` 이벤트를 받지 못한다.
// 그래도 서버는 여기까지 만든 답변을 저장하므로, 중단 직후 이 경로로 다시 읽어
// 화면과 저장된 대화를 일치시킨다.
import { NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';

export async function GET(request: Request) {
  const { userId } = await verifySession();

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // 남의 세션은 열 수 없다 — userId를 조건에 함께 건다
  const session = await prisma.aiSession.findFirst({
    where: { id, userId },
    select: {
      id: true,
      model: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, attachments: true, model: true, createdAt: true },
      },
    },
  });
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json(
    {
      id: session.id,
      model: session.model,
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        attachments: m.attachments ?? [],
        model: m.model,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
