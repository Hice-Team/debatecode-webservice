// 로그인 상태 QA — 로그인해야 열리는 화면을 사람처럼 눌러 본다.
//   node scripts/qa-authed.mjs [이메일] [비밀번호]
//
// 익명으로는 /settings, /dashboard가 로그인으로 튕겨서 검사할 수 없다.
// 실제로 로그인한 뒤에야 드러나는 오류(서버 컴포넌트 예외 등)를 잡는 것이 목적이다.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const EMAIL = process.argv[2] || 'demo@debate.code';
const PASSWORD = process.argv[3] || 'demo1234';

const PAGES = [
  '/dashboard',
  '/settings',
  '/dashboard/market',
  '/dashboard/community-profile',
  '/problems/mine',
  '/community/write',
  '/study/search',
  '/shop/orders',
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`CONSOLE ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (e) => problems.push(`PAGEERROR ${String(e).slice(0, 200)}`));

// ── 로그인
console.log(`로그인 시도: ${EMAIL}`);
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"], input[name="email"]', EMAIL);
await page.fill('input[type="password"], input[name="password"]', PASSWORD);
// 서버 액션이 POST 후 리다이렉트한다 — 로드 완료가 아니라 주소가 바뀌기를 기다린다
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});

const afterLogin = page.url();
console.log(`로그인 후 위치: ${afterLogin}`);
if (afterLogin.includes('/login')) {
  const err = await page.locator('[role="alert"], .text-rose-600').first().textContent().catch(() => null);
  console.log(`로그인 실패 — ${err ? err.trim() : '사유 표시 없음'}`);
  await browser.close();
  process.exit(1);
}

// ── 각 화면 열어 보기
for (const path of PAGES) {
  problems.length = 0;
  let status = '?';
  try {
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
    status = res ? String(res.status()) : 'none';
  } catch (e) {
    status = `LOAD FAIL ${String(e).slice(0, 60)}`;
  }
  await page.waitForTimeout(400);

  // 오류 화면(우리 error.tsx)이 떴는지 — 200이어도 내용은 실패일 수 있다
  const errorScreen = await page
    .locator('text=화면을 불러오지 못했습니다')
    .count()
    .catch(() => 0);
  const finalUrl = page.url().replace(BASE, '');
  const redirected = finalUrl !== path && !finalUrl.startsWith(path);

  const flags = [];
  if (errorScreen > 0) flags.push('오류화면');
  if (redirected) flags.push(`→ ${finalUrl}`);
  if (problems.length) flags.push(`${problems.length}건`);

  console.log(`  ${path.padEnd(30)} ${status.padEnd(4)} ${flags.join(' · ') || 'OK'}`);
  for (const p of problems.slice(0, 2)) console.log(`      ${p}`);
}

await browser.close();
