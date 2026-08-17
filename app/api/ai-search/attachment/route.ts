import { NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { createClient } from '@/app/lib/supabase/server';
import { safeStorageKey } from '@/app/lib/storage';
import { rateLimit } from '@/app/lib/rate-limit';

// AI Search 첨부 업로드 — 이미지/파일을 Storage에 올리고 공개 URL을 돌려준다.
// 파일 형식은 제한하지 않는다(요구사항: 특정 확장자로 좁히지 않음).
// 다만 용량 상한과 사용자별 레이트리밋은 둔다.
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const { userId } = await verifySession();

  if (!rateLimit(`ai-attach:${userId}`, 30, 60_000)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large' }, { status: 413 });
  }

  const supabase = await createClient();
  // 키에는 원본 파일명을 넣지 않는다(한글/공백 → Invalid key). 원본명은 메시지 메타에 남는다.
  const path = safeStorageKey(userId, file.name);
  const { error } = await supabase.storage
    .from('community-uploads')
    .upload(path, file, { contentType: file.type || undefined });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from('community-uploads').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, name: file.name, size: file.size, mime: file.type });
}
