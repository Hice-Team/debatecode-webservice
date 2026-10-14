import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '@/app/lib/dal';
import { createClient } from '@/app/lib/supabase/server';
import {
  AI_ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  attachmentProxyUrl,
  safeStorageKey,
} from '@/app/lib/storage';
import { rateLimit } from '@/app/lib/rate-limit';

// 큰 첨부를 위한 직행 업로드 표 — 브라우저가 서버를 거치지 않고 스토리지에 바로 올린다.
//
// 왜 필요한가. 일반 경로(/api/attachments/upload)는 파일을 요청 본문에 실어 보낸다.
// 그러면 파일 전체가 한 번 서버 메모리를 지나가는데, 서버리스 런타임의 요청 본문 상한은
// 보통 수 MB~수십 MB다. 상한을 10GB로 올려 봐야 그 앞에서 먼저 막힌다.
//
// 그래서 서버는 "여기에 올려라"는 서명된 표만 끊어 주고, 실제 바이트는 브라우저 →
// 스토리지로 직접 간다. 키는 여전히 서버가 정하므로(앞자리 userId) 남의 폴더에는
// 올릴 수 없고, 열람 권한 검사(RLS·프록시)도 그대로다.
const bodySchema = z.object({
  name: z.string().min(1).max(400),
  size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES, '파일이 너무 큽니다.'),
  mime: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const session = await requireApiSession();
  if ('response' in session) return session.response;
  const { userId } = session;

  if (!rateLimit(`ai-attach:${userId}`, 30, 60_000)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0];
    return NextResponse.json({ error: first ?? '파일 정보를 확인해 주세요.' }, { status: 400 });
  }

  // 키에는 원본 파일명을 넣지 않는다(한글/공백 → Invalid key). 원본명은 메시지 메타에 남는다.
  const path = safeStorageKey(userId, parsed.data.name);
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(AI_ATTACHMENT_BUCKET).createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? '업로드 주소를 만들지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({
    path,
    token: data.token,
    bucket: AI_ATTACHMENT_BUCKET,
    // 업로드가 끝나면 클라이언트가 이 주소를 첨부 메타에 넣는다
    url: attachmentProxyUrl(path),
  });
}
