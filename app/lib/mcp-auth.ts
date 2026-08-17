// debateNetwork(MCP)·debateBridge 연동용 개인 액세스 토큰(PAT) 유틸.
// 토큰 평문은 발급 순간에만 존재하고 DB에는 sha256 해시만 저장한다.
// Web Crypto만 사용 — Node/Cloudflare Workers 양쪽에서 동작한다.
import { prisma } from './prisma';

const TOKEN_PREFIX = 'dcp_';

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 새 토큰 평문 생성 (dcp_ + 32바이트 hex). 저장은 호출 측에서 해시로. */
export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${TOKEN_PREFIX}${hex}`;
}

export function tokenPrefix(token: string): string {
  return `${token.slice(0, 8)}…`;
}

export { sha256Hex };

/**
 * Authorization: Bearer dcp_... 헤더를 검증하고 사용자 레코드를 반환한다.
 * 실패 시 null. 타이밍 안전성보다 해시 조회로 단순화(해시는 사전이미지 저항).
 */
export async function authenticateMcp(
  request: Request,
): Promise<{ id: string; email: string; name: string } | null> {
  const auth = request.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(dcp_[a-f0-9]{16,})$/i);
  if (!m) return null;
  const hash = await sha256Hex(m[1]);
  const user = await prisma.user.findUnique({
    where: { mcpTokenHash: hash },
    select: { id: true, email: true, name: true },
  });
  return user ?? null;
}
