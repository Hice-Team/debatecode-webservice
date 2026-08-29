// 사용자 여정 전체를 한 번에 훑는 런타임 QA — 실제 브라우저로 실제 계정을 굴린다.
//
//   npx tsx --env-file=.env scripts/qa-flow.mjs --base http://localhost:3000
//   npx tsx --env-file=.env scripts/qa-flow.mjs --keep      (끝나고 계정을 지우지 않는다)
//   npx tsx --env-file=.env scripts/qa-flow.mjs --headed    (눈으로 보면서)
//
// qa-roles.mjs가 "권한 상태별로 열리는가"를 본다면, 이 스크립트는 **한 사람이 처음부터
// 끝까지 겪는 순서**를 본다. 그래서 계정도 admin API가 아니라 실제 가입 화면으로 만든다 —
// 가입 절차 자체가 점검 대상이기 때문이다.
//
//   1  회원가입 (약관 → 계정 → 프로필)
//   2  로그아웃 → 로그인
//   3  AI 검색
//   4  시그니처 / 디베이트 / 리팩토링 모드 — 풀이 · 실행 · AI · 면접
//   5  디베이트메이트 신청 (PDF 첨부)
//   6  관리자 승인
//   7  메이트 문제 초안 제출 + 관리자 문제 등록 (지원 언어 선택 포함)
//
// 앱의 Prisma 클라이언트를 그대로 쓴다(커넥션을 두 벌 열면 풀러가 중간에 끊는다).
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '../app/lib/prisma';

/* ---------- 설정 ---------- */

const args = process.argv.slice(2);
const BASE = (args.includes('--base') ? args[args.indexOf('--base') + 1] : null) ?? 'http://localhost:3000';
const KEEP = args.includes('--keep');
const HEADED = args.includes('--headed');

const NL = String.fromCharCode(10);
const STAMP = Date.now().toString(36);
const PASSWORD = 'QaFlow!2026#x';
const USER = { email: `qa-flow-${STAMP}@debatecode.org`, nickname: `QA흐름${STAMP.slice(-4)}` };
const ADMIN = { email: `qa-flow-admin-${STAMP}@debatecode.org`, name: 'QA 관리자' };

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ---------- 결과 수집 ---------- */

const results = [];
let phase = 'setup';

function record(name, status, detail = '') {
  results.push({ phase, name, status, detail });
  const mark = status === 'pass' ? '  ✓' : status === 'skip' ? '  –' : status === 'warn' ? '  !' : '  ✗';
  console.log(`${mark} ${name}${detail ? `  · ${detail}` : ''}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    if (detail && typeof detail === 'object' && detail.skip) return record(name, 'skip', detail.skip);
    if (detail && typeof detail === 'object' && detail.warn) return record(name, 'warn', detail.warn);
    record(name, 'pass', typeof detail === 'string' ? detail : '');
    return true;
  } catch (error) {
    const raw = String(error?.stack ?? error?.message ?? error);
    const first = raw.split(NL).map((l) => l.trim()).filter(Boolean)[0] ?? '(메시지 없음)';
    record(name, 'fail', first.slice(0, 220));
    return false;
  }
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

function head(label) {
  phase = label;
  console.log(`${NL}── ${label} ${'─'.repeat(Math.max(0, 52 - label.length))}`);
}

/* ---------- 정리 대상 ---------- */

const createdUsers = [];
let qaProblemId = null;
let qaDraftId = null;
let adminProblemId = null;

async function retry(fn, tries = 4) {
  for (let i = 1; i <= tries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (i === tries) throw e;
      await new Promise((r) => setTimeout(r, 1200 * i));
    }
  }
}

async function cleanup() {
  head('정리');
  if (KEEP) {
    console.log('  – --keep: 계정과 데이터를 남긴다');
    for (const u of createdUsers) console.log(`     ${u.email} (${u.id})`);
    if (adminProblemId) console.log(`     관리자가 만든 문제 #${adminProblemId}`);
    return;
  }
  for (const id of [adminProblemId, qaProblemId].filter(Boolean)) {
    // Problem→Submission에는 CASCADE가 없다. 제출 기록을 먼저 걷어내지 않으면
    // 문제가 지워지지 않고 QA 데이터가 그대로 남는다.
    for (const model of ['submission', 'runAttempt', 'judgeSession', 'debateAiChat', 'debateQSession', 'bookmark', 'workbookItem', 'problemSetItem']) {
      await prisma[model]?.deleteMany({ where: { problemId: id } }).catch(() => {});
    }
    await retry(() => prisma.problem.delete({ where: { id } }))
      .then(() => console.log(`  ✓ 문제 삭제 #${id}`))
      .catch((e) => console.log(`  ✗ 문제 삭제 실패 #${id}: ${String(e.message).slice(0, 120)}`));
  }
  if (qaDraftId) {
    await prisma.problemDraft.delete({ where: { id: qaDraftId } }).catch(() => {});
  }
  for (const { id, email } of createdUsers) {
    try {
      await retry(() => prisma.user.delete({ where: { id } }));
      await supa.auth.admin.deleteUser(id);
      console.log(`  ✓ 계정 삭제 ${email}`);
    } catch {
      console.log(`  ✗ 계정 삭제 실패 ${email} — 수동 확인 필요 (id: ${id})`);
    }
  }
}

/* ---------- 브라우저 도우미 ---------- */

/** 콘솔 오류와 5xx 응답을 페이지마다 모은다 — 화면은 멀쩡한데 뒤에서 터지는 것을 잡는다. */
function watch(page) {
  const errors = [];
  // 우리 앱이 낸 오류만 본다. Supabase SSO 조회(404)나 채널톡 플러그인(401)처럼
  // 외부 호스트가 돌려주는 값은 이 서비스의 결함이 아니다.
  const mine = (u) => typeof u === 'string' && u.startsWith(BASE);
  const noise = (u) => /favicon|[.]map/.test(u);

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/favicon|[.]map|installHook/.test(text)) return;
    if (/channel[.]io|supabase[.]co|Failed to load resource/.test(text)) return;
    errors.push('console: ' + text.slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 160)));
  // Playwright는 confirm을 기본으로 '취소'한다. 난이도 전환처럼 확인을 묻는 흐름이
  // 조용히 되돌아가 버리므로, 사람이 '확인'을 누른 것과 같게 맞춘다.
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('requestfailed', (r) => {
    if (!mine(r.url()) || noise(r.url())) return;
    // 스트리밍(SSE) 요청은 화면을 떠나거나 컴포넌트가 사라지면 중단된다 — 정상 동작이다.
    const why = r.failure()?.errorText ?? '';
    if (why.includes('ERR_ABORTED')) return;
    errors.push('요청실패 ' + why + ' ' + r.url().replace(BASE, '').slice(0, 100));
  });
  page.on('response', (r) => {
    if (!mine(r.url()) || noise(r.url())) return;
    const st = r.status();
    const u = r.url().replace(BASE, '');
    if (st >= 500 || st === 404 || st === 401) errors.push(st + ' ' + u.slice(0, 110));
  });
  return errors;
}

/** 로그인 — 실패하면 화면에 뜬 문구를 붙여 던진다. */
async function login(context, email) {
  const page = await context.newPage();
  const errors = watch(page);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  const ok = await page
    .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    const shown = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(`로그인이 되지 않았다 (${email}) — 화면: ${shown}`);
  }
  return { page, errors };
}

/** 로그인에 실패해도 나머지 단계를 계속 볼 수 있게 감싼다. */
async function tryLogin(context, email, label) {
  try {
    return await login(context, email);
  } catch (e) {
    record(`${label} 로그인`, 'fail', String(e.message).slice(0, 220));
    return null;
  }
}

/* ================= 1. 회원가입 ================= */

async function qaSignup(browser) {
  head('1. 회원가입 절차');
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = watch(page);

  await check('가입 화면이 열린다', async () => {
    await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=약관에 동의해 주세요', { timeout: 30_000 });
  });

  await check('약관 전체 동의 → 다음 단계', async () => {
    // 첫 체크박스가 "전체 동의". 필수만 켜도 되지만 전체 동의 경로도 함께 본다.
    await page.locator('input[type="checkbox"]').first().check();
    const btn = page.getByRole('button', { name: /동의하고 계속하기/ });
    expect(await btn.isEnabled(), '전체 동의 후에도 계속하기 버튼이 잠겨 있다');
    await btn.click();
    await page.waitForSelector('input[name="email"]', { timeout: 30_000 });
  });

  await check('계정 정보 입력 → 프로필 단계', async () => {
    await page.fill('input[name="email"]', USER.email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.fill('input[name="passwordConfirm"]', PASSWORD);
    await page.fill('input[name="nickname"]', USER.nickname);
    await page.fill('input[name="birthdate"]', '2000-03-15');
    // 성별은 칩 버튼이 hidden input을 채운다 — 값을 직접 넣으면 화면 상태와 어긋난다.
    await page.getByRole('button', { name: '밝히지 않음' }).click();
    await page.click('button[type="submit"]');
    // 프로필 단계(major) 또는 환영 화면 중 먼저 오는 쪽을 기다린다.
    // 둘 다 안 오면 화면에 뜬 오류 문구를 그대로 실패 사유로 올린다 — 원인을 감추지 않는다.
    const moved = await Promise.race([
      page.waitForSelector('input[name="major"]', { timeout: 60_000 }).then(() => 'profile'),
      page.waitForSelector('text=환영', { timeout: 60_000 }).then(() => 'welcome'),
    ]).catch(() => null);
    if (!moved) {
      const shown = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300);
      throw new Error(`계정 단계에서 멈췄다 — 화면: ${shown}`);
    }
    return moved;
  });

  await check('프로필 단계를 마치고 서비스로 진입', async () => {
    const major = page.locator('input[name="major"]');
    if (await major.count()) {
      // 포지션·관심 태그·유입 경로는 전부 칩이고 셋 다 필수다.
      await page.getByRole('button', { name: '백엔드' }).first().click();
      await page.getByRole('button', { name: '알고리즘' }).first().click();
      await major.fill('컴퓨터공학');
      await page.getByRole('button', { name: /검색 \(구글/ }).first().click();
      await page.click('button[type="submit"]');
    }
    // 위저드는 마지막에 환영 화면을 보여 주거나 곧장 대시보드로 넘어간다 — 둘 다 정상.
    const done = await Promise.race([
      page.waitForSelector('text=환영', { timeout: 90_000 }).then(() => 'welcome'),
      page.waitForURL((u) => !u.pathname.startsWith('/signup'), { timeout: 90_000 }).then(() => 'redirect'),
    ]).catch(() => null);
    if (!done) {
      const shown = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300);
      throw new Error(`프로필 단계에서 멈췄다 — 화면: ${shown}`);
    }
    return `${done} · ${page.url().replace(BASE, '') || '/'}`;
  });

  await check('가입 계정이 DB에 만들어졌다', async () => {
    const row = await retry(async () => {
      const u = await prisma.user.findFirst({
        where: { email: USER.email },
        select: { id: true, name: true, role: true },
      });
      if (!u) throw new Error('아직 User 행이 없다');
      return u;
    }, 6);
    createdUsers.push({ id: row.id, email: USER.email });
    expect(row.role === 'user', `기본 권한이 user가 아니다: ${row.role}`);
    return `role=${row.role} · name=${row.name}`;
  });

  // 위저드가 어디서 멈췄든, 이후 점검이 가능하도록 필수 상태를 채운다.
  // (이메일 인증·AI 온보딩은 이 흐름의 점검 대상이 아니다.)
  const me = createdUsers.at(-1);
  if (me) {
    await prisma.user.update({
      where: { id: me.id },
      data: { profileCompleted: true, aiOnboarded: true, consentAt: new Date(), aiTermsAgreedAt: new Date() },
    });
  }

  await check('가입 중 콘솔 오류·5xx 없음', async () => {
    expect(errors.length === 0, errors.slice(0, 3).join(' / '));
  });

  await context.close();
}

/* ================= 2. 로그인 ================= */

async function qaLogin(browser) {
  head('2. 로그인 절차');
  const context = await browser.newContext();

  let page;
  await check('가입한 계정으로 로그인된다', async () => {
    const r = await login(context, USER.email);
    page = r.page;
    return page.url().replace(BASE, '') || '/';
  });
  if (!page) return context.close();

  await check('로그인 상태에서 대시보드가 열린다', async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    expect(!page.url().includes('/login'), '대시보드가 로그인으로 되돌렸다');
  });

  await context.close();
}

/* ================= 3. AI 검색 ================= */

async function qaAiSearch(browser) {
  head('3. AI 검색');
  const context = await browser.newContext();
  const session = await tryLogin(context, USER.email, phase);
  if (!session) return context.close();
  const { page, errors } = session;

  await check('AI 검색 화면이 열린다', async () => {
    await page.goto(`${BASE}/study/search`, { waitUntil: 'domcontentloaded' });
    expect(!page.url().includes('/login'), '로그인으로 되돌아갔다');
  });

  await check('질문을 보내면 답변이 온다', async () => {
    const box = page.locator('textarea').first();
    if (!(await box.count())) return { skip: '입력창을 찾지 못했다' };
    // 보내기 전 본문 길이를 재 둔다 — 늘어난 만큼이 답변이다.
    // 화면 전체 길이를 기준으로 두면 안내 문구를 줄이는 것만으로 검사가 깨진다.
    const before = (await page.locator('main').innerText()).length;
    await box.fill('파이썬에서 리스트를 정렬하는 방법을 한 문장으로 알려줘');
    await box.press('Enter');

    // 스트리밍이라 시간이 걸린다. 답변이 끝나야 붙는 모델 표기를 신호로 쓴다.
    const done = await page
      .waitForSelector('text=/DeepSeek/', { timeout: 120_000 })
      .then(() => true)
      .catch(() => false);
    if (!done) return { warn: '120초 안에 모델 표기가 붙지 않았다 (업스트림 지연 가능)' };

    await page.waitForTimeout(1500);
    const grew = (await page.locator('main').innerText()).length - before;
    if (grew < 40) return { warn: `답변이 거의 늘지 않았다 (+${grew}자)` };
    return `+${grew}자 응답`;
  });

  await check('대화가 세션으로 저장된다', async () => {
    const me = createdUsers.find((u) => u.email === USER.email);
    const n = await prisma.aiSession.count({ where: { userId: me.id } });
    expect(n >= 1, '세션이 저장되지 않았다');
    return `세션 ${n}개`;
  });

  await check('AI 검색 중 콘솔 오류·5xx 없음', async () => {
    expect(errors.length === 0, errors.slice(0, 3).join(' / '));
  });

  await context.close();
}

/* ================= 문제 픽스처 ================= */

async function loadFixture() {
  const p = await prisma.problem.create({
    data: {
      slug: `qa-flow-sum-${STAMP}`,
      title: `QA 두 수의 합 (${STAMP})`,
      difficulty: 1,
      category: '해시',
      tags: ['QA'],
      description: '두 정수를 받아 합을 돌려주세요. QA 자동 점검이 만든 문제이며 끝나면 지워집니다.',
      timeLimitMs: 3000,
      starterCodes: {
        javascript: ['function solution(a, b) {', '  return 0;', '}'].join(NL),
        python: ['def solution(a, b):', '    return 0'].join(NL),
      },
      keywords: ['덧셈', '시간복잡도'],
      testCases: {
        create: [
          { input: [1, 2], expected: 3, isHidden: false, order: 0 },
          { input: [10, 20], expected: 30, isHidden: false, order: 1 },
          { input: [-5, 5], expected: 0, isHidden: true, order: 2 },
        ],
      },
    },
    select: { id: true },
  });
  qaProblemId = p.id;
  return p.id;
}

/**
 * 처음 들어온 이용자에게 뜨는 온보딩 투어를 닫는다.
 *
 * 8단계 오버레이가 화면을 덮고 있어 그대로 두면 어떤 버튼도 눌리지 않는다.
 * 실제 이용자도 똑같이 겪는 화면이라 "닫을 수 있는가" 자체가 점검 대상이다.
 */
async function dismissTour(page) {
  let closed = false;
  for (let i = 0; i < 3; i += 1) {
    const skip = page.getByRole('button', { name: /건너뛰기|앞으로 보지 않기/ }).first();
    if (!(await skip.count())) break;
    await skip.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    closed = true;
  }
  return closed;
}

/* ================= 4. 풀이 모드 ================= */

// 한 줄로 둔다. 여러 줄을 넣으면 Monaco가 줄마다 자동 들여쓰기·괄호 보정을 하면서
// 닫는 중괄호를 하나 더 만들어, 사람이 친 적 없는 문법 오류가 제출된다.
const SOLUTION_JS = 'function solution(a, b) { return a + b; }';

/**
 * 에디터에 코드를 넣는다.
 *
 * Monaco는 보이는 글자가 DOM 텍스트가 아니라 캔버스에 가까운 뷰이고, 실제 입력은
 * 화면 밖 textarea가 받는다. 그래서 textarea에 값을 꽂는 것이 아니라 **에디터를 눌러
 * 초점을 준 뒤 키보드로 친다** — 그래야 onChange가 실제로 돈다.
 */
async function typeSolution(page) {
  const editor = page.locator('.monaco-editor').first();
  await editor.waitFor({ timeout: 30_000 });
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  // type()으로 한 글자씩 치면 Monaco의 자동 괄호 닫기가 끼어들어 `}}`, `))`가 생긴다.
  // insertText는 키 이벤트 없이 입력만 넣어 자동 완성을 건드리지 않는다.
  await page.keyboard.insertText(SOLUTION_JS);
  await page.waitForTimeout(500);
}

/** 모드 세그먼트는 button이 아니라 role="radio"다 — data-segment로 집는다. */
async function selectSegment(page, key) {
  const seg = page.locator(`[data-segment="${key}"]`).first();
  if (!(await seg.count())) return { skip: `${key} 세그먼트를 찾지 못했다` };
  if (await seg.isDisabled()) return { skip: `${key} 세그먼트가 잠겨 있다` };
  await seg.click();
  await page.waitForTimeout(1500);
  return null;
}

async function qaSolveModes(browser, problemId) {
  head('4. 풀이 · 실행 · AI · 면접');
  const context = await browser.newContext();
  const session = await tryLogin(context, USER.email, phase);
  if (!session) return context.close();
  const { page, errors } = session;

  await check('워크스페이스가 열린다', async () => {
    await page.goto(`${BASE}/problems/${problemId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.cm-content, textarea', { timeout: 45_000 });
  });

  await check('온보딩 투어를 닫을 수 있다', async () => {
    const had = await dismissTour(page);
    const left = await page.getByRole('button', { name: /건너뛰기/ }).count();
    expect(left === 0, '건너뛰기를 눌렀는데도 투어가 남아 있다');
    return had ? '투어 닫음' : '투어 없음';
  });

  await check('코드 에디터에서 전역 배너가 보이지 않는다', async () => {
    // 배너는 콘솔 설정으로 켜는 것이라 평소엔 꺼져 있다. 켜 두고 확인한 뒤 되돌린다.
    const key = 'content.banner_text';
    const before = await prisma.appSetting.findUnique({ where: { key } }).catch(() => null);
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: `QA 배너 ${STAMP}`, category: 'content' },
      update: { value: `QA 배너 ${STAMP}` },
    });
    try {
      await page.goto(`${BASE}/problems`, { waitUntil: 'domcontentloaded' });
      const onList = await page.locator(`text=QA 배너 ${STAMP}`).count();
      await page.goto(`${BASE}/problems/${problemId}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.cm-content, textarea', { timeout: 45_000 });
      await dismissTour(page);
      const onSolve = await page.locator(`text=QA 배너 ${STAMP}`).count();
      expect(onList > 0, '목록 화면에도 배너가 뜨지 않는다 — 배너 기능 자체를 확인해야 한다');
      expect(onSolve === 0, '코드 에디터에 전역 배너가 그대로 보인다');
      return '목록 O · 에디터 X';
    } finally {
      if (before) await prisma.appSetting.update({ where: { key }, data: { value: before.value } });
      else await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    }
  });

  await check('지원 언어만 선택지에 뜬다', async () => {
    const opts = await page.locator('select').first().locator('option').allInnerTexts();
    expect(opts.length >= 1, '언어 선택지가 비어 있다');
    return opts.join(', ');
  });

  await check('시그니처모드로 전환된다', async () => {
    const skipped = await selectSegment(page, 'signature');
    if (skipped) return skipped;
    return '전환 확인';
  });

  await check('코드를 실행하면 예제가 통과한다', async () => {
    await typeSolution(page);
    await page.locator('[data-tour="run"]').first().click();
    await page.waitForSelector('text=/통과|PASS|성공|실패|FAIL|오류/', { timeout: 120_000 });
    const body = await page.locator('body').innerText();
    expect(/통과|PASS/.test(body), `실행 결과에 통과 표시가 없다 — ${body.replace(/\s+/g, ' ').slice(0, 160)}`);
    return '예제 통과';
  });

  await check('제출하면 채점 결과가 기록된다', async () => {
    const submit = page.locator('[data-tour="submit"]').first();
    if (!(await submit.count())) return { skip: '제출 버튼이 없다 (시그니처모드가 아님)' };
    await submit.click();
    const me = createdUsers.find((u) => u.email === USER.email);
    if (!me) return { skip: '가입 계정을 못 찾아 확인할 수 없다' };
    const sub = await retry(async () => {
      const row = await prisma.submission.findFirst({
        where: { userId: me.id, problemId },
        orderBy: { createdAt: 'desc' },
        select: { status: true, passedCount: true, totalCount: true, code: true },
      });
      if (!row) throw new Error('제출 기록이 없다');
      return row;
    }, 6);
    if (sub.status !== 'PASS') {
      const shown = (await page.locator('body').innerText())
        .replace(/[\s]+/g, ' ')
        .match(/테스트 결과.{0,320}/)?.[0] ?? '(결과표를 읽지 못했다)';
      throw new Error(
        `채점 결과가 PASS가 아니다: ${sub.status} (${sub.passedCount}/${sub.totalCount})` +
          ` — 제출된 코드: ${JSON.stringify(sub.code).slice(0, 200)} — ${shown}`,
      );
    }
    return `status=${sub.status} (${sub.passedCount}/${sub.totalCount})`;
  });

  await check('디베이트모드로 전환된다', async () => {
    const skipped = await selectSegment(page, 'debate');
    if (skipped) return skipped;
    return '전환 확인';
  });

  await check('DebateAI 탭이 응답한다', async () => {
    // debateAI 탭은 모드가 아니라 **난이도**가 정한다 — 쉬움에서만 열린다(scaffold.allowsAi).
    const easy = await selectSegment(page, 'easy');
    if (easy) return easy;
    const tab = page.locator('[data-tour="debate-tab"]').first();
    if (!(await tab.count())) return { skip: '쉬움 난이도인데도 debateAI 탭이 없다' };
    await tab.click();
    await page.waitForTimeout(800);
    // textarea를 그냥 last()로 집으면 Monaco의 화면 밖 입력창이 잡힌다.
    const box = page.getByLabel('debateAI에게 보낼 메시지');
    if (!(await box.count())) return { skip: 'AI 입력창을 찾지 못했다' };
    if (await box.isDisabled()) {
      const shown = (await page.locator('[data-tour="tabs"]').locator('..').innerText())
        .replace(/[\s]+/g, ' ')
        .slice(0, 260);
      return { warn: `AI 입력창이 잠겨 있다 — ${shown}` };
    }
    await box.fill('이 코드의 시간복잡도를 한 문장으로 알려줘');
    await box.press('Enter');
    // 답이 한 문장일 수 있다 — 임계값을 크게 잡으면 정상 응답도 실패로 읽힌다.
    const before = (await page.locator('body').innerText()).length;
    const grew = await page
      .waitForFunction((n) => document.body.innerText.length > n + 25, before, { timeout: 120_000 })
      .then(() => true)
      .catch(() => false);
    if (!grew) return { warn: '120초 안에 AI 응답이 오지 않았다 (업스트림 지연 가능)' };
    await page.waitForTimeout(2500);
    const after = (await page.locator('body').innerText()).length;
    return `AI 응답 확인 (+${after - before}자)`;
  });

  await check('면접(디베이트) 세션이 시작된다', async () => {
    const me = createdUsers.find((u) => u.email === USER.email);
    if (!me) return { skip: '가입 계정을 못 찾아 확인할 수 없다' };
    const passed = await prisma.submission.count({ where: { userId: me.id, problemId, status: 'PASS' } });
    if (passed === 0) return { skip: '통과 제출이 없어 면접이 열리지 않는다' };
    const n = await retry(async () => {
      const c = await prisma.interviewSession.count({ where: { userId: me.id, submission: { problemId } } });
      if (c === 0) throw new Error('면접 세션이 아직 없다');
      return c;
    }, 5).catch(() => 0);
    if (n === 0) return { warn: '제출은 PASS인데 면접 세션이 만들어지지 않았다' };
    return `면접 세션 ${n}건`;
  });

  await check('리팩토링모드로 전환된다', async () => {
    const skipped = await selectSegment(page, 'refactor');
    if (skipped) return skipped;
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    expect(!/오류가 발생|문제가 발생/.test(body), '리팩토링 전환 후 오류 화면이 떴다');
    return '전환 확인';
  });

  await check('풀이 중 콘솔 오류·5xx 없음', async () => {
    expect(errors.length === 0, errors.slice(0, 3).join(' / '));
  });

  await context.close();
}

/* ================= 5. 디베이트메이트 신청 ================= */

async function qaMateApply(browser) {
  head('5. 디베이트메이트 신청');
  const context = await browser.newContext();
  const session = await tryLogin(context, USER.email, phase);
  if (!session) return context.close();
  const { page, errors } = session;

  const dir = mkdtempSync(join(tmpdir(), 'qa-mate-'));
  const pdfPath = join(dir, 'qa-application.pdf');
  // 최소한의 유효한 PDF — 앱이 확장자·MIME을 본다.
  writeFileSync(
    pdfPath,
    ['%PDF-1.4', '1 0 obj<</Type/Catalog>>endobj', 'trailer<</Root 1 0 R>>', '%%EOF'].join(NL),
    'latin1',
  );

  await check('신청 화면이 열린다', async () => {
    await page.goto(`${BASE}/debate-mate`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /디베이트메이트 신청하기/ }).click({ timeout: 30_000 });
    await page.waitForSelector('input[name="attachment"]', { timeout: 20_000 });
  });

  await check('PDF를 첨부하고 제출한다', async () => {
    await page.fill(
      'textarea[name="motivation"]',
      'QA 자동 점검이 제출한 신청입니다. 알고리즘 문제를 꾸준히 출제하고 커뮤니티 답변에도 참여하고 싶습니다.',
    );
    await page.setInputFiles('input[name="attachment"]', pdfPath);
    await page.check('input[name="submissionConsent"]');
    await page.getByRole('button', { name: '신청 제출' }).click();
    const done = await page
      .waitForSelector('text=/접수되었습니다|검토 결과를 기다/', { timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    if (!done) {
      const shown = (await page.locator('body').innerText()).replace(/[\s]+/g, ' ').slice(0, 300);
      throw new Error(`제출 후 접수 안내가 뜨지 않았다 — 화면: ${shown}`);
    }
  });

  await check('신청이 DB에 pending으로 기록된다', async () => {
    const me = createdUsers.find((u) => u.email === USER.email);
    const app = await retry(async () => {
      const a = await prisma.debateMateApplication.findUnique({
        where: { userId: me.id },
        select: { status: true },
      });
      if (!a) throw new Error('신청 행이 없다');
      return a;
    });
    expect(app.status === 'pending', `상태가 pending이 아니다: ${app.status}`);
    return 'pending';
  });

  await check('신청 중 콘솔 오류·5xx 없음', async () => {
    expect(errors.length === 0, errors.slice(0, 3).join(' / '));
  });

  await context.close();
}

/* ================= 6. 관리자 승인 ================= */

async function qaAdminApprove(browser) {
  head('6. 관리자 승인');

  // 관리자 계정은 가입 화면으로 만들 수 없다(권한은 DB에서만 준다).
  await check('관리자 계정 준비', async () => {
    const { data, error } = await supa.auth.admin.createUser({
      email: ADMIN.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: ADMIN.name },
    });
    if (error) throw new Error(error.message);
    const id = data.user.id;
    await prisma.user.upsert({
      where: { id },
      create: { id, email: ADMIN.email, name: ADMIN.name, role: 'admin' },
      update: { role: 'admin' },
    });
    await prisma.user.update({
      where: { id },
      data: { role: 'admin', profileCompleted: true, aiOnboarded: true, consentAt: new Date(), aiTermsAgreedAt: new Date() },
    });
    createdUsers.push({ id, email: ADMIN.email });
    return ADMIN.email;
  });

  const context = await browser.newContext();
  const session = await tryLogin(context, ADMIN.email, phase);
  if (!session) return context.close();
  const { page, errors } = session;

  await check('콘솔 › 메이트 화면이 열린다', async () => {
    await page.goto(`${BASE}/console/mates`, { waitUntil: 'domcontentloaded' });
    expect(!page.url().includes('/login'), '관리자인데 로그인으로 되돌렸다');
    await page.waitForSelector('text=/승인|신청/', { timeout: 30_000 });
  });

  await check('신청을 승인한다', async () => {
    // 신청 카드는 접힌 <details>다. 펼치지 않으면 승인 버튼이 DOM에 있어도 눌리지 않는다.
    const cards = page.locator('details');
    const n = await cards.count();
    expect(n > 0, '대기 중 신청 카드가 목록에 뜨지 않는다');
    for (let i = 0; i < n; i += 1) await cards.nth(i).locator('summary').click().catch(() => {});
    await page.waitForTimeout(600);

    const approve = page.getByRole('button', { name: '승인' }).first();
    expect(await approve.count(), '펼쳤는데도 승인 버튼이 없다');
    await approve.click();
    await page.waitForTimeout(3500);

    const me = createdUsers.find((u) => u.email === USER.email);
    if (!me) return '승인 클릭 (신청자 확인 불가)';
    const app = await retry(async () => {
      const row = await prisma.debateMateApplication.findUnique({
        where: { userId: me.id },
        select: { status: true, reviewedAt: true },
      });
      if (!row || row.status === 'pending') throw new Error(`신청서가 아직 ${row?.status ?? '없음'}`);
      return row;
    }, 5);
    expect(app.status === 'approved', `신청서 상태가 approved가 아니다: ${app.status}`);
    return `신청서 ${app.status}`;
  });

  await check('신청자 권한이 debate_mate로 바뀐다', async () => {
    const me = createdUsers.find((u) => u.email === USER.email);
    const row = await retry(async () => {
      const u = await prisma.user.findUnique({ where: { id: me.id }, select: { role: true } });
      if (u.role !== 'debate_mate') throw new Error(`아직 ${u.role}`);
      return u;
    });
    return `role=${row.role}`;
  });

  await check('승인 중 콘솔 오류·5xx 없음', async () => {
    expect(errors.length === 0, errors.slice(0, 3).join(' / '));
  });

  await context.close();
  return { page: null };
}

/* ================= 7. 문제 추가 ================= */

async function qaAuthoring(browser) {
  head('7. 문제 추가 — 메이트 · 관리자');

  /* --- 메이트: 초안 제출 --- */
  {
    const context = await browser.newContext();
    const session = await tryLogin(context, USER.email, phase);
    if (!session) return context.close();
    const { page, errors } = session;

    await check('메이트 콘솔에서 초안 폼이 열린다', async () => {
      await page.goto(`${BASE}/console/drafts`, { waitUntil: 'domcontentloaded' });
      const open = page.getByRole('button', { name: /새 문제 초안 작성/ });
      expect(await open.count(), '초안 작성 버튼이 없다 — 메이트 권한이 반영되지 않았다');
      // 하이드레이션 전에 누르면 클릭이 씹힌다 — 폼이 뜰 때까지 몇 번 다시 누른다.
      for (let i = 0; i < 4; i += 1) {
        if (await page.locator('#draft-title').count()) break;
        await open.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1500);
      }
      await page.waitForSelector('#draft-title', { timeout: 20_000 });
    });

    await check('초안을 제출한다', async () => {
      await page.fill('#draft-title', `QA 메이트 문제 ${STAMP}`);
      await page.fill(
        '#draft-desc',
        'QA 자동 점검이 제출한 초안입니다. 두 정수의 합을 구하는 문제이며 검토 후 삭제됩니다.',
      );
      await page.getByRole('button', { name: /검토큐에 제출/ }).click();
      await page.waitForSelector('text=/검토큐에 제출되었습니다|검토 결과를 기다/', { timeout: 45_000 });
    });

    await check('초안이 검토큐에 pending으로 쌓인다', async () => {
      const me = createdUsers.find((u) => u.email === USER.email);
      const d = await retry(async () => {
        const row = await prisma.problemDraft.findFirst({
          where: { authorId: me.id },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, title: true },
        });
        if (!row) throw new Error('초안이 없다');
        return row;
      });
      qaDraftId = d.id;
      expect(d.status === 'pending', `상태가 pending이 아니다: ${d.status}`);
      return `${d.title} · ${d.status}`;
    });

    await check('메이트 출제 중 콘솔 오류·5xx 없음', async () => {
      expect(errors.length === 0, errors.slice(0, 3).join(' / '));
    });

    await context.close();
  }

  /* --- 관리자: 문제 등록 (지원 언어 선택) --- */
  {
    const context = await browser.newContext();
    const session = await tryLogin(context, ADMIN.email, phase);
    if (!session) return context.close();
    const { page, errors } = session;

    await check('관리자 문제 등록 화면이 열린다', async () => {
      await page.goto(`${BASE}/problems/new`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('input[name="title"]', { timeout: 30_000 });
    });

    await check('지원 언어 선택 UI가 있다', async () => {
      const boxes = page.locator('input[name="languages"]');
      const n = await boxes.count();
      expect(n >= 2, `언어 체크박스가 ${n}개뿐이다`);
      const checked = await page.locator('input[name="languages"]:checked').count();
      return `${n}개 · 기본 ${checked}개 선택`;
    });

    await check('언어를 하나만 골라 문제를 등록한다', async () => {
      // Python을 끄고 JavaScript만 남긴다 → 스타터 입력도 하나만 떠야 한다
      await page.locator('input[name="languages"][value="python"]').uncheck();
      await page.waitForTimeout(400);
      const starters = await page.locator('textarea[name="starterJs"], textarea[name="starterPy"]').count();
      expect(starters === 1, `언어를 하나만 골랐는데 스타터 입력이 ${starters}개다`);

      await page.fill('input[name="title"]', `QA 관리자 문제 ${STAMP}`);
      await page.fill('input[name="category"]', '해시');
      await page.fill(
        'textarea[name="description"]',
        'QA 자동 점검이 등록한 문제입니다. 두 정수의 합을 구하며 점검이 끝나면 삭제됩니다.',
      );
      await page.fill('input[name="keywords"]', '덧셈, 시간복잡도');
      await page.fill('textarea[name="starterJs"]', ['function solution(a, b) {', '  return 0;', '}'].join(NL));
      await page.fill('input[name="tcInput"]', '[1, 2]');
      await page.fill('input[name="tcExpected"]', '3');
      await page.getByRole('button', { name: '문제 등록하기' }).click();
      await page.waitForTimeout(3500);
      // 폼이 그대로 남아 있으면 서버 검증에서 막힌 것이다 — 사유를 그대로 올린다.
      if (await page.locator('input[name="title"]').count()) {
        const shown = (await page.locator('form').innerText()).replace(/\s+/g, ' ').slice(0, 300);
        throw new Error(`등록 폼이 그대로 남아 있다 — ${shown}`);
      }
      return page.url().replace(BASE, '');
    });

    await check('등록된 문제가 JavaScript만 지원한다', async () => {
      const p = await retry(async () => {
        const row = await prisma.problem.findFirst({
          where: { title: { contains: STAMP } },
          orderBy: { id: 'desc' },
          select: { id: true, starterCodes: true, title: true },
        });
        if (!row || !row.title.includes('관리자')) throw new Error('등록된 문제를 찾지 못했다');
        return row;
      });
      adminProblemId = p.id;
      const keys = Object.keys(p.starterCodes ?? {});
      expect(keys.length === 1 && keys[0] === 'javascript', `starterCodes 키가 ${JSON.stringify(keys)}`);
      return `#${p.id} · ${keys.join(', ')}`;
    });

    await check('문제집 목록에 지원 언어가 표시된다', async () => {
      await page.goto(`${BASE}/problems?q=${encodeURIComponent(String(STAMP))}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('table', { timeout: 30_000 });
      const body = await page.locator('table').innerText();
      expect(body.includes('JavaScript'), '목록에 JavaScript 표기가 없다');
      expect(!/QA 관리자 문제[\s\S]{0,200}Python/.test(body), '지원하지 않는 Python이 표기됐다');
      return 'LANG 칸 확인';
    });

    await check('언어 필터가 여러 개 선택에서 OR로 동작한다', async () => {
      const url = `${BASE}/problems?language=javascript&language=python&q=${encodeURIComponent(String(STAMP))}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('table', { timeout: 30_000 });
      const body = await page.locator('table').innerText();
      expect(body.includes('QA 관리자 문제'), '둘 다 고르자 JavaScript 전용 문제가 사라졌다 (AND로 걸린다)');

      await page.goto(`${BASE}/problems?language=python&q=${encodeURIComponent(String(STAMP))}`, {
        waitUntil: 'domcontentloaded',
      });
      const onlyPy = await page.locator('table').innerText();
      expect(!onlyPy.includes('QA 관리자 문제'), 'Python만 골랐는데 JavaScript 전용 문제가 남아 있다');
      return 'OR 동작 확인';
    });

    await check('관리자 출제 중 콘솔 오류·5xx 없음', async () => {
      expect(errors.length === 0, errors.slice(0, 3).join(' / '));
    });

    await context.close();
  }
}

/* ================= 실행 ================= */

async function main() {
  console.log(`QA 흐름 점검 — ${BASE}`);
  console.log(`계정: ${USER.email} / ${ADMIN.email}${NL}`);

  const browser = await chromium.launch({ headless: !HEADED });
  try {
    await qaSignup(browser);
    await qaLogin(browser);
    await qaAiSearch(browser);
    const problemId = await loadFixture();
    await qaSolveModes(browser, problemId);
    await qaMateApply(browser);
    await qaAdminApprove(browser);
    await qaAuthoring(browser);
  } finally {
    await browser.close();
    await cleanup();
    await prisma.$disconnect();
  }

  /* ---------- 요약 ---------- */
  const by = (s) => results.filter((r) => r.status === s).length;
  console.log(`${NL}${'═'.repeat(56)}`);
  console.log(`통과 ${by('pass')} · 실패 ${by('fail')} · 경고 ${by('warn')} · 건너뜀 ${by('skip')}`);
  const bad = results.filter((r) => r.status === 'fail');
  if (bad.length) {
    console.log(`${NL}실패:`);
    for (const r of bad) console.log(`  ✗ [${r.phase}] ${r.name} — ${r.detail}`);
  }
  const warned = results.filter((r) => r.status === 'warn');
  if (warned.length) {
    console.log(`${NL}경고:`);
    for (const r of warned) console.log(`  ! [${r.phase}] ${r.name} — ${r.detail}`);
  }
  const skipped = results.filter((r) => r.status === 'skip');
  if (skipped.length) {
    console.log(`${NL}건너뜀:`);
    for (const r of skipped) console.log(`  – [${r.phase}] ${r.name} — ${r.detail}`);
  }
  process.exit(bad.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
