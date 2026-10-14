import { NextResponse } from 'next/server';
import { requireApiSession } from '@/app/lib/dal';
import { createClient } from '@/app/lib/supabase/server';
import {
  AI_ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  attachmentProxyUrl,
  safeStorageKey,
} from '@/app/lib/storage';
import { rateLimit } from '@/app/lib/rate-limit';

// debateAI 첨부 업로드 — 이미지/파일을 비공개 버킷에 올리고 열람용 프록시 주소를 돌려준다.
// 파일 형식은 제한하지 않는다(요구사항: 특정 확장자로 좁히지 않음).
// 다만 용량 상한과 사용자별 레이트리밋은 둔다.
//
// 이 경로는 **작은 파일 전용**이다. 큰 파일은 요청 본문에 실으면 런타임 본문 상한에
// 먼저 걸리므로, 클라이언트가 /api/attachments/upload/signed에서 서명된 업로드 주소를
// 받아 스토리지로 직접 올린다. 상한값(MAX_ATTACHMENT_BYTES)은 두 경로가 함께 쓴다.

export async function POST(request: Request) {
  const session = await requireApiSession();
  if ('response' in session) return session.response;
  const { userId } = session;

  if (!rateLimit(`ai-attach:${userId}`, 30, 60_000)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: 'file too large' }, { status: 413 });
  }

  const supabase = await createClient();
  // 키에는 원본 파일명을 넣지 않는다(한글/공백 → Invalid key). 원본명은 메시지 메타에 남는다.
  // 앞자리가 userId여야 버킷 RLS와 열람 프록시가 소유자를 가려낼 수 있다.
  const path = safeStorageKey(userId, file.name);
  const { error } = await supabase.storage
    .from(AI_ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 공개 URL이 아니라 프록시 주소를 돌려준다 — 첨부는 올린 본인만 열 수 있다
  return NextResponse.json({
    url: attachmentProxyUrl(path),
    name: file.name,
    size: file.size,
    mime: file.type,
  });
}
