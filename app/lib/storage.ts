// Supabase Storage 키 유틸 — 오브젝트 키는 ASCII 안전 문자만 허용된다.
// 한글/공백/특수문자 파일명("스크린샷 (1).png" 등)을 그대로 키에 쓰면
// "Invalid key" 오류로 업로드가 실패하므로, 키는 uuid로 만들고 원본 이름은 label에 보존한다.

export function safeStorageKey(userId: string, filename: string): string {
  // 확장자만 추출해 소문자 영숫자로 제한 (없거나 이상하면 bin)
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : 'bin';
  return `${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
}
