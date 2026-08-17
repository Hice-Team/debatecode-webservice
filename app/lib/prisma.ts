import { PrismaClient } from '@/app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Cloudflare Workers에는 Prisma 기본 바이너리 엔진이 없어 driver adapter(pg)로 연결한다.
// Supabase는 Workers 환경에서 pooler(6543, pgbouncer) URL을 사용해야 한다.
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// 개발 중 Prisma schema를 갱신하면 Turbopack의 global singleton에는 이전 생성
// 클라이언트가 남을 수 있다. 최신 모델(ProblemSet)이 없는 인스턴스는 재사용하지 않는다.
const cached = globalForPrisma.prisma as (PrismaClient & { problemSet?: unknown }) | undefined;
export const prisma = cached?.problemSet ? cached : createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
