import { NextResponse } from 'next/server';
import { authenticateMcp } from '@/app/lib/mcp-auth';
import { rateLimit } from '@/app/lib/rate-limit';

// GET /api/mcp/whoami — 연동 토큰 유효성 및 계정 정보
export async function GET(request: Request) {
  const user = await authenticateMcp(request);
  if (!user) return NextResponse.json({ error: '유효하지 않은 연동 토큰입니다.' }, { status: 401 });
  if (!rateLimit(`mcp:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: '요청이 너무 잦습니다.' }, { status: 429 });
  }
  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
}
