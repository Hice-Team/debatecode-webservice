// 지속 레이트 리밋이 실제로 세는지 확인한다.
//   npx tsx --env-file=.env scripts/check-rate-limit.ts
//
// 한도 3, 창 5초로 5번 두드려 4번째부터 막히는지 본다.
import { PrismaClient } from '../app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const KEY = `selftest:${Date.now()}`;

async function hit() {
  const rows = await prisma.$queryRaw<
    { allowed: boolean; current_count: number; retry_after_ms: number }[]
  >`SELECT * FROM public.rate_limit_hit(${KEY}, 3::int, 5000::int)`;
  return rows[0];
}

async function main() {
  console.log('한도 3회 / 창 5초 —', KEY);
  for (let i = 1; i <= 5; i += 1) {
    const r = await hit();
    console.log(
      `  ${i}번째: ${r.allowed ? '통과' : '차단'} (count=${r.current_count}, 남은 ${Math.round(r.retry_after_ms / 1000)}초)`,
    );
  }

  // 동시 요청 — 읽고-쓰기 경쟁이 있으면 여기서 한도를 넘겨 통과한다
  const raceKey = `${KEY}:race`;
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      prisma.$queryRaw<{ allowed: boolean }[]>`SELECT * FROM public.rate_limit_hit(${raceKey}, 3::int, 5000::int)`,
    ),
  );
  const passed = results.filter((r) => r[0]?.allowed).length;
  console.log(`\n동시 10회 중 통과: ${passed}회 (기대: 3회)`);
  console.log(passed === 3 ? '  → 원자성 확인' : '  → 경쟁 발생, 확인 필요');

  await prisma.$executeRaw`DELETE FROM "RateLimitCounter" WHERE "key" LIKE ${KEY + '%'}`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
