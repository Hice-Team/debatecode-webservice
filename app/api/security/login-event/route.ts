import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { recordLoginEvent } from '@/app/lib/security';
import { rateLimit } from '@/app/lib/rate-limit';

// POST /api/security/login-event — 로그인 직후 클라이언트가 호출. IP/기기 기록 + 새 IP 감지.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (!rateLimit(`login-event:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  const { isNew } = await recordLoginEvent(user.id, request.headers);
  return NextResponse.json({ isNew });
}
