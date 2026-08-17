// IP 보안 — 로그인 이벤트 기록 및 새 IP 감지. 원문 IP는 저장하지 않고 해시/마스킹만 보관한다.
import { prisma } from './prisma';
import { sha256Hex } from './mcp-auth';

// Cloudflare(cf-connecting-ip) 우선, 그다음 X-Forwarded-For 첫 홉.
export function clientIpFromHeaders(h: Headers): string {
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip')?.trim() || 'unknown';
}

// 표시용 마스킹 — IPv4는 마지막 옥텟, IPv6는 앞 2블록만 남긴다.
export function maskIp(ip: string): string {
  if (ip.includes('.')) {
    const p = ip.split('.');
    if (p.length === 4) return `${p[0]}.${p[1]}.${p[2]}.x`;
  }
  if (ip.includes(':')) {
    const b = ip.split(':').filter(Boolean);
    return `${b.slice(0, 2).join(':')}:…`;
  }
  return ip;
}

// 로그인 이벤트 기록 + 처음 보는 IP 여부 반환. 최근 50건만 유지한다.
export async function recordLoginEvent(userId: string, h: Headers): Promise<{ isNew: boolean }> {
  const ip = clientIpFromHeaders(h);
  const ipHash = await sha256Hex(`${userId}:${ip}`);
  const userAgent = h.get('user-agent')?.slice(0, 300) ?? null;

  const seen = await prisma.loginEvent.findFirst({ where: { userId, ipHash }, select: { id: true } });
  const isNew = !seen;

  await prisma.loginEvent.create({ data: { userId, ipHash, ipMasked: maskIp(ip), userAgent, isNew } });

  const old = await prisma.loginEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: 50,
    select: { id: true },
  });
  if (old.length > 0) {
    await prisma.loginEvent.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
  return { isNew };
}
