// sha256 — Web Crypto만 사용해 Node·Cloudflare Workers 양쪽에서 같게 동작한다.
//
// 되돌릴 필요가 없는 값(토큰, 백업 코드, 코드 지문)은 해시로 보관한다.
// 되돌릴 수 있게 저장해야 하는 값(이용자 API 키 등)은 app/lib/crypto.ts 쪽이다.

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 길이가 같은 두 문자열을 시간 차이 없이 비교한다.
 *
 * 해시끼리의 비교라 사전이미지 저항이 이미 있지만, 인증 경로에서 `===`를 쓰면
 * "어디까지 맞았는가"가 시간으로 새어 나갈 여지를 남긴다. 비용이 없으니 막아 둔다.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
