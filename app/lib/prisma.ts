import { PrismaClient } from '@/app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaFingerprint?: string };

// Cloudflare Workers에는 Prisma 기본 바이너리 엔진이 없어 driver adapter(pg)로 연결한다.
// Supabase는 Workers 환경에서 pooler(6543, pgbouncer) URL을 사용해야 한다.
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// 개발 중 Prisma schema를 갱신하면 Turbopack의 global singleton에 이전 생성 클라이언트가
// 남는다. 새 모델을 부르는 순간 "그런 속성이 없다"로 터지는데, 원인이 스키마가 아니라
// 캐시라는 걸 알아채기까지 시간이 걸린다.
//
// 예전에는 특정 모델(`problemSet`)이 있는지로 판정했다. 기준이 "그때 마침 새로 추가된
// 모델"이라, 그 모델의 이름이 바뀌거나 사라지면 매 요청 새 클라이언트가 만들어져
// 커넥션이 조용히 샌다. 지금은 생성된 클라이언트가 아는 **모델 목록의 지문**으로 본다 —
// 스키마가 바뀌면 지문이 바뀌고, 특정 모델 이름에 묶이지 않는다.
function schemaFingerprint(client: PrismaClient): string {
  // 델리게이트(모델) 이름만 모은다. 내부 필드(_, $)는 제외.
  const names = Object.keys(client).filter((k) => !k.startsWith('_') && !k.startsWith('$'));
  return names.sort().join(',');
}

const globalCache = globalForPrisma as { prisma?: PrismaClient; prismaFingerprint?: string };

function resolveClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return globalCache.prisma ?? createPrismaClient();
  }
  const fresh = createPrismaClient();
  const fingerprint = schemaFingerprint(fresh);
  if (globalCache.prisma && globalCache.prismaFingerprint === fingerprint) {
    // 스키마가 그대로다 — 방금 만든 것은 버리고 기존 커넥션을 계속 쓴다
    void fresh.$disconnect().catch(() => {});
    return globalCache.prisma;
  }
  globalCache.prismaFingerprint = fingerprint;
  return fresh;
}

export const prisma = resolveClient();

if (process.env.NODE_ENV !== 'production') globalCache.prisma = prisma;
