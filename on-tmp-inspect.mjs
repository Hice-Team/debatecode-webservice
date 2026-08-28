// DB 현재 상태 점검 — 읽기 전용. 아무것도 바꾸지 않는다.
import { PrismaClient } from './app/generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const q = async (label, fn) => {
  try {
    console.log(label, await fn());
  } catch (e) {
    console.log(label, 'ERR:', String(e.message).slice(0, 160));
  }
};

console.log('=== 접속 ===');
await q('  host        ', async () => {
  const u = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
  return `${u.hostname}:${u.port}${u.pathname}`;
});
await q('  SELECT 1    ', async () => (await prisma.$queryRaw`SELECT 1 as ok`)[0]);
await q('  버전        ', async () => (await prisma.$queryRaw`SELECT version()`)[0].version.slice(0, 40));

console.log('\n=== 마이그레이션이 만들 것들이 이미 있는가 ===');
for (const t of ['JudgeSession', 'AiUsageCounter']) {
  await q(`  표 ${t.padEnd(16)}`, async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('public."${t}"') IS NOT NULL AS exists`,
    );
    return r[0].exists ? '있음' : '없음 → 마이그레이션 필요';
  });
}
for (const f of ['ai_usage_hit', 'rate_limit_hit', 'judge_session_sweep']) {
  await q(`  함수 ${f.padEnd(14)}`, async () => {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM pg_proc WHERE proname = '${f}'`,
    );
    return r[0].n > 0 ? '있음' : '없음';
  });
}

console.log('\n=== 마이그레이션이 지울 것들 (지금 몇 행인가) ===');
await q('  BackupCode  ', async () => {
  const r = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "BackupCode"`;
  return `${r[0].n}행`;
});
await q('  WebauthnKey ', async () => {
  const r = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "WebauthnKey"`;
  return `${r[0].n}행`;
});

console.log('\n=== 데이터 규모 ===');
for (const [label, model] of [
  ['User        ', 'user'],
  ['Problem     ', 'problem'],
  ['TestCase    ', 'testCase'],
  ['Submission  ', 'submission'],
  ['RunAttempt  ', 'runAttempt'],
  ['Post        ', 'post'],
  ['PointLedger ', 'pointLedger'],
  ['ShopProduct ', 'shopProduct'],
  ['AiSession   ', 'aiSession'],
]) {
  await q(`  ${label}`, async () => `${await prisma[model].count()}행`);
}

console.log('\n=== 문제 하나 (채점 QA에 쓸 것) ===');
await q('  샘플        ', async () => {
  const p = await prisma.problem.findFirst({
    orderBy: { difficulty: 'asc' },
    select: {
      id: true,
      slug: true,
      title: true,
      timeLimitMs: true,
      starterCodes: true,
      testCases: { select: { id: true, isHidden: true } },
    },
  });
  if (!p) return '문제 없음';
  const hidden = p.testCases.filter((c) => c.isHidden).length;
  return `#${p.id} ${p.title} — 케이스 ${p.testCases.length}개(히든 ${hidden}) · 언어 ${Object.keys(p.starterCodes ?? {}).join(',')}`;
});

console.log('\n=== 이메일 인증 관련 ===');
await q('  EmailVerification 행', async () => `${await prisma.emailVerification.count()}행`);
await q('  auth.users 중 미확인 ', async () => {
  const r = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM auth.users WHERE email_confirmed_at IS NULL`;
  return `${r[0].n}명 (가입 시 email_confirm:true라 0이 정상)`;
});

await prisma.$disconnect();
