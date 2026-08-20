// 시즌·랭킹 설정 확인 — 콘솔 화면 없이 지금 값이 무엇인지 확인할 때 쓴다.
//   npx tsx scripts/check-season.ts
import { PrismaClient } from '../app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

async function main() {
  const rows = await prisma.appSetting.findMany({
    where: { category: 'season' },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value as unknown]));

  const epochRaw = (byKey.get('season.epoch') as string) ?? '2025-01-06';
  const lengthDays = (byKey.get('season.length_days') as number) ?? 7;
  const indexBase = (byKey.get('season.index_base') as number) ?? 1;
  const floor = (byKey.get('ranking.reset_at') as string) ?? '';

  const [y, m, d] = epochRaw.split('-').map(Number);
  const epochMs = Date.UTC(y, m - 1, d) - KST_OFFSET_MS;
  const lengthMs = lengthDays * DAY_MS;
  const elapsed = Date.now() - epochMs;
  const step = elapsed < 0 ? 0 : Math.floor(elapsed / lengthMs);
  const start = new Date(epochMs + step * lengthMs);

  console.log('저장된 설정:', Object.fromEntries(byKey));
  console.log(`현재 시즌: S${indexBase + step}`);
  console.log(`시즌 시작: ${start.toISOString()} (KST ${new Date(start.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16)})`);
  console.log(`랭킹 집계 시작: ${floor || '(제한 없음)'}`);

  const resets = await prisma.rankingReset.count();
  console.log(`개인 랭킹 초기화 기록: ${resets}건`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
