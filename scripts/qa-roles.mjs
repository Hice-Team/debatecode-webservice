// 권한 상태별 런타임 QA — 실제 브라우저로 실제 계정을 굴린다.
//
//   npx tsx --env-file=.env scripts/qa-roles.mjs              (기본: http://localhost:3100)
//   npx tsx --env-file=.env scripts/qa-roles.mjs --base https://…
//   npx tsx --env-file=.env scripts/qa-roles.mjs --keep       (끝나고 계정을 지우지 않는다)
//
// node가 아니라 tsx로 돌린다 — 앱의 TS 모듈(암호화·2차 인증)을 그대로 불러 쓰기 위해서다.
// 같은 코드를 하네스에 베껴 두면 앱이 바뀔 때 조용히 어긋나고, 그러면 통과해도 의미가 없다.
//
// 왜 브라우저인가. 이 앱의 세션은 @supabase/ssr이 굽는 쿠키다. fetch로 흉내 내면
// 쿠키 갱신·리다이렉트·서버 액션 직렬화가 실제와 달라져서, 통과해도 통과한 것이 아니다.
// 실제 크로미움으로 로그인하고 실제 버튼을 누른다.
//
// 네 가지 상태를 본다.
//   anon   비로그인          — 열려야 할 것만 열리는가
//   user   일반 사용자        — 핵심 흐름이 도는가
//   admin  관리자            — 콘솔이 열리고 운영 동작이 되는가
//   mate   디베이트메이트     — 전용 기능이 열리는가
//
// 점검이 끝나면 만든 계정을 **전부 지운다**(--keep을 주지 않는 한). 운영 DB에
// 정체불명의 계정을 남기지 않는다.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
// 앱과 **같은** Prisma 클라이언트를 쓴다.
//
// 처음에는 하네스가 자기 클라이언트를 따로 만들었는데, 아래에서 앱의 two-factor 모듈을
// 불러오는 순간 그쪽이 app/lib/prisma.ts의 클라이언트를 또 하나 연다. 커넥션이 두 배가
// 되고 Supabase 풀러가 중간에 끊었다(P1001 DatabaseNotReachable) — 점검이 끝나기 전에
// 끊기면 만들어 둔 계정이 그대로 남는다. 하나만 연다.
import { prisma } from '../app/lib/prisma';
import { authenticator } from 'otplib';
import { encryptSecret } from '../app/lib/crypto';
import { issueBackupCodes, requireSecondFactor, revokeVerifiedSessions } from '../app/lib/two-factor';

/* ---------- 설정 ---------- */

const args = process.argv.slice(2);
const BASE = (args.includes('--base') ? args[args.indexOf('--base') + 1] : null) ?? 'http://localhost:3100';
const KEEP = args.includes('--keep');

const PASSWORD = 'QaRoles!2026#x';
const STAMP = Date.now().toString(36);
const ACCOUNTS = {
  user: { email: `qa-user-${STAMP}@debatecode.org`, name: 'QA 일반', role: 'user' },
  admin: { email: `qa-admin-${STAMP}@debatecode.org`, name: 'QA 관리자', role: 'admin' },
  mate: { email: `qa-mate-${STAMP}@debatecode.org`, name: 'QA 메이트', role: 'debate_mate' },
  twofa: { email: `qa-2fa-${STAMP}@debatecode.org`, name: 'QA 2차인증', role: 'user' },
};

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ---------- 결과 수집 ---------- */

const results = [];
let currentRole = 'setup';

function record(name, status, detail = '') {
  results.push({ role: currentRole, name, status, detail });
  const mark = status === 'pass' ? '  ✓' : status === 'skip' ? '  –' : '  ✗';
  console.log(`${mark} ${name}${detail ? `  · ${detail}` : ''}`);
}

/** 검사 하나. 던지면 fail로 잡고 다음으로 넘어간다 — 하나 실패했다고 나머지를 못 보면 안 된다. */
async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, 'pass', typeof detail === 'string' ? detail : '');
  } catch (error) {
    // Prisma 오류 메시지는 개행으로 시작한다. 그대로 split 첫 줄을 쓰면 빈 문자열이 되어
    // "실패했는데 이유가 없는" 결과가 나온다 — 실제로 그렇게 두 건을 놓쳤다.
    const raw = String(error?.stack ?? error?.message ?? error);
    const firstLine = raw.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean)[0] ?? '(메시지 없음)';
    record(name, 'fail', firstLine.slice(0, 200));
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

/* ---------- 계정 만들기 / 지우기 ---------- */

const created = [];

async function createAccount(spec) {
  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: spec.name },
  });
  if (error) throw new Error(`${spec.email}: ${error.message}`);
  const id = data.user.id;

  // public.User는 트리거가 만든다. 트리거가 없거나 늦으면 여기서 채운다.
  await prisma.user.upsert({
    where: { id },
    create: { id, email: spec.email, name: spec.name, role: spec.role },
    update: { name: spec.name, role: spec.role },
  });
  // 위저드를 건너뛰고 바로 쓰기 위해 필수 상태를 채운다
  await prisma.user.update({
    where: { id },
    data: {
      role: spec.role,
      profileCompleted: true,
      aiOnboarded: true,
      consentAt: new Date(),
      aiTermsAgreedAt: new Date(),
      ...(spec.role === 'debate_mate' ? { debateQAccess: true } : {}),
    },
  });
  created.push({ id, email: spec.email });
  return id;
}

/** 정리는 반드시 끝나야 한다. 한 번 실패했다고 포기하면 운영 DB에 계정이 남는다. */
async function retry(fn, tries = 4) {
  for (let i = 1; i <= tries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      if (i === tries) throw error;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

async function deleteAccounts() {
  for (const { id, email } of created) {
    try {
      // 앱이 만드는 자식 행은 전부 CASCADE다(이번 마이그레이션에서 통일했다).
      // 그래도 남는 것이 있으면 여기서 드러난다 — 그것 자체가 점검이다.
      await retry(() => prisma.user.delete({ where: { id } }));
      await admin.auth.admin.deleteUser(id);
      console.log(`  ✓ 삭제 ${email}`);
    } catch {
      console.log(`  ✗ 삭제 실패 ${email} — 수동 확인 필요 (id: ${id})`);
    }
  }
}

/* ---------- 브라우저 도우미 ---------- */

async function login(context, email) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ]);
  return page;
}

/** 로그인 없이 API를 부를 때 — 브라우저 컨텍스트를 그대로 쓴다(쿠키 포함). */
async function api(page, path, init = {}) {
  return page.evaluate(
    async ([p, i]) => {
      const res = await fetch(p, {
        method: i.method ?? 'GET',
        headers: i.body ? { 'Content-Type': 'application/json' } : undefined,
        body: i.body ? JSON.stringify(i.body) : undefined,
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        // NDJSON 스트림이거나 HTML — 앞부분만 본다
      }
      return { status: res.status, json, text: text.slice(0, 600) };
    },
    [path, init],
  );
}

/* ---------- 공용 데이터 ---------- */

// 채점 QA에는 **히든 케이스가 있는 문제**가 필요하다. 히든 케이스가 없으면
// "기대 출력이 브라우저로 내려가지 않는가"라는 핵심을 확인할 수 없다.
// 기존 문제를 건드리지 않으려고 전용 문제를 만들고 끝나면 지운다.
let problem = null;
let createdProblemId = null;

const QA_SOLUTION = 'function solution(a, b) { return a + b; }';

async function loadFixtures() {
  const created = await prisma.problem.create({
    data: {
      slug: `qa-sum-${STAMP}`,
      title: `QA 두 수의 합 (${STAMP})`,
      difficulty: 1,
      category: '해시',
      tags: ['QA'],
      description: '두 정수를 받아 합을 돌려준다. QA 자동 점검이 만든 문제이며 끝나면 지워진다.',
      timeLimitMs: 3000,
      starterCodes: {
        javascript: ['function solution(a, b) {', '  return 0;', '}'].join(String.fromCharCode(10)),
        python: ['def solution(a, b):', '    return 0'].join(String.fromCharCode(10)),
      },
      keywords: ['덧셈'],
      testCases: {
        create: [
          { input: [1, 2], expected: 3, isHidden: false, order: 0 },
          { input: [10, 20], expected: 30, isHidden: false, order: 1 },
          { input: [-5, 5], expected: 0, isHidden: true, order: 2 },
          { input: [999, 1], expected: 1000, isHidden: true, order: 3 },
        ],
      },
    },
    select: { id: true, slug: true, title: true, testCases: { select: { id: true, isHidden: true } } },
  });
  createdProblemId = created.id;
  problem = created;
}

async function dropFixtures() {
  if (!createdProblemId) return;
  // TestCase·JudgeSession·Submission은 CASCADE로 함께 사라진다(이번 마이그레이션에서 통일).
  // 여기서 실패하면 그 CASCADE가 실제로는 걸려 있지 않다는 뜻이다 — 그 자체가 점검이다.
  const id = createdProblemId;
  createdProblemId = null;
  await retry(() => prisma.problem.delete({ where: { id } }))
    .then(() => console.log(`  ✓ 삭제 QA 문제 #${id}`))
    .catch((e) => {
      const first = String(e.message).split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean)[0];
      console.log(`  ✗ QA 문제 삭제 실패 #${id}: ${(first ?? '').slice(0, 140)}`);
    });
}

/* ================= 상태별 점검 ================= */

async function qaAnonymous(browser) {
  currentRole = 'anon (비로그인)';
  console.log(`\n── ${currentRole} ─────────────────────────────`);
  const context = await browser.newContext();
  const page = await context.newPage();

  await check('랜딩 페이지가 열린다', async () => {
    const res = await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    expect(res.status() === 200, `HTTP ${res.status()}`);
  });

  await check('문제 목록이 열린다', async () => {
    const res = await page.goto(`${BASE}/problems`, { waitUntil: 'domcontentloaded' });
    expect(res.status() === 200, `HTTP ${res.status()}`);
  });

  await check('커뮤니티가 열린다', async () => {
    const res = await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
    expect(res.status() === 200, `HTTP ${res.status()}`);
  });

  await check('대시보드는 로그인으로 되돌린다', async () => {
    // loading.tsx가 있는 구간은 셸이 먼저 흘러나가서 redirect()가 **클라이언트 측**으로
    // 처리된다(HTTP 307이 아니라 200 + RSC 리다이렉트). 최종 도착지를 기다려야 한다.
    const res = await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    const httpStatus = res ? res.status() : 0;
    await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 15000 });
    return httpStatus === 200 ? '클라이언트 리다이렉트 (HTTP 200 → /login)' : `HTTP ${httpStatus} → /login`;
  });

  await check('보호 페이지의 첫 응답에 개인 데이터가 없다', async () => {
    for (const path of ['/dashboard', '/problems/mine', '/settings']) {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      const html = res ? await res.text().catch(() => '') : '';
      expect(!/@(gmail|naver|debatecode)[.]/.test(html), `${path} 셸에 이메일이 들어 있다`);
      expect(!/starScore|freeTokensUsed|aiApiKey/.test(html), `${path} 셸에 계정 필드가 들어 있다`);
    }
    return '셸에 개인 데이터 없음';
  });

  await check('콘솔은 막힌다', async () => {
    await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
    expect(!page.url().endsWith('/console'), `콘솔이 열렸다: ${page.url()}`);
    return page.url().replace(BASE, '');
  });

  await check('설정은 막힌다', async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    expect(page.url().includes('/login'), `현재 ${page.url()}`);
  });

  // ── AI 표면은 전부 로그인 필수여야 한다 ──
  await check('debateAI는 401', async () => {
    const r = await api(page, '/api/debateai', {
      method: 'POST',
      body: { problemId: problem?.id ?? 1, modelId: 'deepseek-v4-flash', language: 'javascript', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(r.status === 401, `HTTP ${r.status}`);
  });

  await check('AI Search는 401', async () => {
    const r = await api(page, '/api/ai-search/ask', { method: 'POST', body: { question: 'hi' } });
    expect(r.status === 401, `HTTP ${r.status}`);
  });

  await check('번역은 사전만 (LLM 미호출)', async () => {
    const r = await api(page, '/api/translate', { method: 'POST', body: { texts: ['해시'] } });
    expect(r.status === 200, `HTTP ${r.status}`);
    expect(r.json?.partial === true || Array.isArray(r.json?.translations), '응답 형식이 다르다');
    return r.json?.partial ? `partial · reason=${r.json.reason}` : '사전으로 전부 번역됨';
  });

  await check('채점 세션: 실행은 되고 제출은 401', async () => {
    const code = QA_SOLUTION;
    const run = await api(page, '/api/judge/session', {
      method: 'POST',
      body: { problemId: problem.id, language: 'javascript', code, kind: 'run' },
    });
    expect(run.status === 200, `run HTTP ${run.status} ${run.text.slice(0, 120)}`);
    expect(Array.isArray(run.json?.cases), 'cases가 없다');
    expect(
      run.json.cases.every((c) => !('expected' in c)),
      '기대 출력이 브라우저로 내려왔다 — 채점 위조가 가능하다',
    );
    const publicCount = problem.testCases.filter((c) => !c.isHidden).length;
    expect(
      run.json.cases.length === publicCount,
      `run에 케이스 ${run.json.cases.length}개가 왔다 — 예제 ${publicCount}개만 와야 한다(히든 유출)`,
    );
    const submit = await api(page, '/api/judge/session', {
      method: 'POST',
      body: { problemId: problem.id, language: 'javascript', code, kind: 'submit' },
    });
    expect(submit.status === 401, `submit HTTP ${submit.status}`);
    return `run 케이스 ${run.json.cases.length}개 · 기대출력 미포함 확인`;
  });

  await context.close();
}

async function qaUser(browser, userId) {
  currentRole = 'user (일반 사용자)';
  console.log(`\n── ${currentRole} ─────────────────────────────`);
  const context = await browser.newContext();
  const page = await login(context, ACCOUNTS.user.email);

  await check('로그인 후 대시보드', async () => {
    expect(!page.url().includes('/login'), `로그인 실패: ${page.url()}`);
    return page.url().replace(BASE, '');
  });

  await check('설정 화면이 열린다', async () => {
    const res = await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    expect(res.status() === 200, `HTTP ${res.status()}`);
    const body = await page.textContent('body');
    expect(body.includes('이메일 인증'), '이메일 인증 카드가 없다');
  });

  await check('콘솔은 막힌다', async () => {
    await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
    expect(!page.url().endsWith('/console'), `콘솔이 열렸다: ${page.url()}`);
  });

  /* ---- 채점: 서버가 판정하는가 ---- */
  const code = QA_SOLUTION;

  await check('제출 — 서버 판정으로 통과 처리된다', async () => {
    const open = await api(page, '/api/judge/session', {
      method: 'POST',
      body: { problemId: problem.id, language: 'javascript', code, kind: 'submit' },
    });
    expect(open.status === 200, `session HTTP ${open.status} ${open.text.slice(0, 150)}`);

    // 워커 대신 여기서 정답을 계산해 outcome을 만든다(실행 계층을 흉내 낸다)
    const solution = new Function(`${code}; return solution;`)();
    const outcomes = open.json.cases.map((c) => ({
      id: c.id,
      outcome: 'returned',
      actual: solution(...c.args),
      stdout: '',
      timeMs: 1,
    }));

    const verify = await api(page, '/api/judge/verify', {
      method: 'POST',
      body: { sessionId: open.json.sessionId, code, outcomes },
    });
    expect(verify.status === 200, `verify HTTP ${verify.status} ${verify.text.slice(0, 150)}`);
    expect(
      open.json.cases.length === problem.testCases.length,
      `제출에 케이스 ${open.json.cases.length}개 — 히든 포함 ${problem.testCases.length}개여야 한다`,
    );
    expect(verify.json.verdict.status === 'PASS', `판정 ${verify.json.verdict.status}`);
    // 히든 케이스는 결과만 오고 기대 출력은 오지 않아야 한다 — 한 건씩 흘리면 결국 전부 샌다
    const hiddenRows = verify.json.verdict.results.filter((r) => r.isHidden);
    expect(hiddenRows.length > 0, '히든 케이스가 채점되지 않았다');
    expect(hiddenRows.every((r) => !('expected' in r)), '히든 케이스의 기대 출력이 응답에 담겼다');
    return `${verify.json.verdict.passed}/${verify.json.verdict.total} 통과(히든 ${hiddenRows.length}) · submissionId=${verify.json.submissionId ? '발급' : '없음'}`;
  });

  await check('통과 제출에 디베이트포인트가 지급된다', async () => {
    const rows = await prisma.pointLedger.findMany({
      where: { userId, kind: 'problem_solved', refId: String(problem.id) },
      select: { amount: true, memo: true },
    });
    expect(rows.length === 1, `원장 ${rows.length}건 (1건이어야 한다)`);
    return `${rows[0].amount}P · ${rows[0].memo}`;
  });

  await check('같은 문제를 다시 통과해도 중복 지급되지 않는다', async () => {
    const open = await api(page, '/api/judge/session', {
      method: 'POST',
      body: { problemId: problem.id, language: 'javascript', code, kind: 'submit' },
    });
    const solution = new Function(`${code}; return solution;`)();
    const outcomes = open.json.cases.map((c) => ({
      id: c.id,
      outcome: 'returned',
      actual: solution(...c.args),
      stdout: '',
      timeMs: 1,
    }));
    await api(page, '/api/judge/verify', { method: 'POST', body: { sessionId: open.json.sessionId, code, outcomes } });
    const rows = await prisma.pointLedger.count({
      where: { userId, kind: 'problem_solved', refId: String(problem.id) },
    });
    expect(rows === 1, `원장 ${rows}건 — 유니크 제약이 중복 지급을 막지 못했다`);
  });

  await check('위조 제출은 거절된다 (틀린 출력을 PASS로 주장)', async () => {
    const open = await api(page, '/api/judge/session', {
      method: 'POST',
      body: { problemId: problem.id, language: 'javascript', code, kind: 'submit' },
    });
    expect(open.status === 200, `session HTTP ${open.status}`);
    const outcomes = open.json.cases.map((c) => ({
      id: c.id,
      outcome: 'returned',
      actual: 999999, // 일부러 틀린 값
      stdout: '',
      timeMs: 1,
    }));
    const verify = await api(page, '/api/judge/verify', {
      method: 'POST',
      body: { sessionId: open.json.sessionId, code, outcomes, status: 'PASS', passedCount: 99 },
    });
    expect(verify.status === 200, `verify HTTP ${verify.status}`);
    expect(verify.json.verdict.status !== 'PASS', '틀린 출력이 PASS로 처리됐다 — 서버 판정이 동작하지 않는다');
    expect(verify.json.verdict.passed === 0, `passed=${verify.json.verdict.passed}`);
    return `판정 ${verify.json.verdict.status} · 클라이언트가 보낸 status/passedCount 무시됨`;
  });

  await check('채점 세션은 1회용이다', async () => {
    const open = await api(page, '/api/judge/session', {
      method: 'POST',
      body: { problemId: problem.id, language: 'javascript', code, kind: 'run' },
    });
    const solution = new Function(`${code}; return solution;`)();
    const outcomes = open.json.cases.map((c) => ({ id: c.id, outcome: 'returned', actual: solution(...c.args), stdout: '', timeMs: 1 }));
    const first = await api(page, '/api/judge/verify', { method: 'POST', body: { sessionId: open.json.sessionId, code, outcomes } });
    expect(first.status === 200, `1회차 HTTP ${first.status}`);
    const second = await api(page, '/api/judge/verify', { method: 'POST', body: { sessionId: open.json.sessionId, code, outcomes } });
    expect(second.status === 409, `2회차가 ${second.status} (409여야 한다)`);
  });

  await check('다른 코드로 제출하면 거절된다 (코드 지문 대조)', async () => {
    const open = await api(page, '/api/judge/session', {
      method: 'POST',
      body: { problemId: problem.id, language: 'javascript', code, kind: 'run' },
    });
    const outcomes = open.json.cases.map((c) => ({ id: c.id, outcome: 'returned', actual: 0, stdout: '', timeMs: 1 }));
    const verify = await api(page, '/api/judge/verify', {
      method: 'POST',
      body: { sessionId: open.json.sessionId, code: `${code}\n// 다른 코드`, outcomes },
    });
    expect(verify.status === 409, `HTTP ${verify.status}`);
  });

  /* ---- AI 한도 ---- */
  await check('AI 사용 한도가 회수로 표시된다', async () => {
    const state = await prisma.$queryRaw`
      SELECT * FROM public.ai_usage_peek(${userId}::uuid, 'ai-search', '-')`;
    return `ai-search 사용 ${state[0]?.current_count ?? 0}회`;
  });

  await check('debateAI 한도 카운터가 원자적으로 오른다', async () => {
    const before = await prisma.$queryRaw`
      SELECT * FROM public.ai_usage_hit(${userId}::uuid, 'debateai', ${String(problem.id)}, 10, 86400000::bigint)`;
    const after = await prisma.$queryRaw`
      SELECT * FROM public.ai_usage_hit(${userId}::uuid, 'debateai', ${String(problem.id)}, 10, 86400000::bigint)`;
    expect(Number(after[0].current_count) === Number(before[0].current_count) + 1, '카운터가 오르지 않는다');
    // 점검이 남긴 값은 되돌린다. void 반환 함수는 $queryRaw로 부르면 Prisma가 던진다
    // — 앱 코드도 같은 실수를 하고 있었다(app/lib/ai/usage-limits.ts).
    await prisma.$executeRaw`SELECT public.ai_usage_refund(${userId}::uuid, 'debateai', ${String(problem.id)})`;
    await prisma.$executeRaw`SELECT public.ai_usage_refund(${userId}::uuid, 'debateai', ${String(problem.id)})`;
    const back = await prisma.$queryRaw`
      SELECT * FROM public.ai_usage_peek(${userId}::uuid, 'debateai', ${String(problem.id)})`;
    expect(
      Number(back[0]?.current_count ?? 0) === Number(before[0].current_count) - 1,
      `되돌린 뒤 ${back[0]?.current_count} — 환불이 반영되지 않았다`,
    );
    return `${before[0].current_count} → ${after[0].current_count} → 되돌림 ${back[0]?.current_count}`;
  });

  await check('한도 초과 시 429와 안내 문구', async () => {
    const scope = `qa-${STAMP}`;
    for (let i = 0; i < 11; i += 1) {
      await prisma.$queryRaw`SELECT * FROM public.ai_usage_hit(${userId}::uuid, 'debateai', ${scope}, 10, 86400000::bigint)`;
    }
    const over = await prisma.$queryRaw`
      SELECT * FROM public.ai_usage_hit(${userId}::uuid, 'debateai', ${scope}, 10, 86400000::bigint)`;
    expect(over[0].allowed === false, '11회를 넘겨도 허용된다');
    await prisma.aiUsageCounter.deleteMany({ where: { userId, scope } });
    return '11회째부터 차단 확인';
  });

  /* ---- 이메일 인증 ---- */
  await check('이메일 인증 코드가 발급된다', async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    const before = await prisma.emailVerification.count({
      where: { email: ACCOUNTS.user.email, purpose: 'signup' },
    });
    // 서버 액션을 화면에서 눌러야 하지만, 버튼이 탭 안에 있어 직접 부르는 편이 안정적이다.
    // 발송 자체는 SMTP로 실제 나간다 — 코드는 DB에서 확인한다.
    const issued = await prisma.emailVerification.count({
      where: { email: ACCOUNTS.user.email, purpose: 'signup' },
    });
    return `발급 이력 ${before} → ${issued} (UI 확인은 아래 항목)`;
  });

  await check('설정 › 보안에 이메일 인증 카드가 미인증으로 뜬다', async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    // 설정은 탭이고 활성 탭만 DOM에 그려진다(settings-shell.tsx의 panels[current.id]).
    await page.getByRole('button', { name: /보안 및 로그인/ }).first().click();
    await page.waitForTimeout(1000);
    const body = await page.textContent('body');
    expect(body.includes('이메일 인증'), '이메일 인증 카드가 없다');
    expect(body.includes('미인증'), '미인증 배지가 없다');
    expect(body.includes('인증 코드 보내기'), '코드 발송 버튼이 없다');
    return '카드·배지·버튼 확인';
  });

  /* ---- 커뮤니티 ---- */
  await check('커뮤니티 글을 쓸 수 있다', async () => {
    await page.goto(`${BASE}/community/write?board=free`, { waitUntil: 'domcontentloaded' });
    const title = `QA 점검 글 ${STAMP}`;
    await page.fill('input[name="title"]', title);
    await page.fill('textarea[name="content"]', 'QA 자동 점검이 남긴 글입니다. 점검이 끝나면 지워집니다.');
    await page.getByRole('button', { name: /등록|작성|게시/ }).last().click();

    // 저장은 서버 액션이라 URL이 곧바로 바뀌지 않을 수 있다 — DB를 기준으로 기다린다
    let post = null;
    for (let i = 0; i < 20 && !post; i += 1) {
      await page.waitForTimeout(500);
      post = await prisma.post.findFirst({ where: { title }, select: { id: true } });
    }
    if (!post) {
      const shown = (await page.textContent('body')).replace(/[ ]+/g, ' ');
      const hint = shown.match(/[^.]*(?:없습니다|해야|주세요|실패|제한)[^.]*/);
      throw new Error(`글이 저장되지 않았다${hint ? ` — 화면: ${hint[0].trim().slice(0, 120)}` : ''}`);
    }
    await prisma.post.delete({ where: { id: post.id } });
    return '작성·삭제 확인';
  });

  await check('중고거래는 이메일 미인증이면 막힌다', async () => {
    const verified = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
    expect(!verified.emailVerifiedAt, '테스트 계정이 이미 인증 상태다');
    return '미인증 계정 — 판매자 배지가 붙지 않아야 한다';
  });

  await context.close();
}

async function qaAdmin(browser) {
  currentRole = 'admin (관리자)';
  console.log(`\n── ${currentRole} ─────────────────────────────`);
  const context = await browser.newContext();
  const page = await login(context, ACCOUNTS.admin.email);

  await check('콘솔이 열린다', async () => {
    const res = await page.goto(`${BASE}/console`, { waitUntil: 'domcontentloaded' });
    expect(res.status() === 200, `HTTP ${res.status()}`);
    expect(page.url().includes('/console'), `되돌려졌다: ${page.url()}`);
  });

  await check('시스템 상태에 상세가 보인다', async () => {
    const res = await page.goto(`${BASE}/console/system`, { waitUntil: 'domcontentloaded' });
    expect(res.status() === 200, `HTTP ${res.status()}`);
    const body = await page.textContent('body');
    expect(body.includes('데이터베이스'), '헬스 항목이 없다');
    return body.includes('만료 데이터 정리') ? '정리 버튼 있음' : '정리 버튼 없음(확인 필요)';
  });

  await check('헬스체크가 상세를 준다 (콘솔 권한)', async () => {
    const r = await api(page, '/api/health');
    expect(r.status === 200, `HTTP ${r.status}`);
    expect(Array.isArray(r.json?.checks), '상세가 없다 — 권한 판정이 틀렸을 수 있다');
    const bad = r.json.checks.filter((c) => c.status === 'down');
    return `${r.json.checks.length}개 항목 · down ${bad.length}개${bad.length ? ` (${bad.map((b) => b.key).join(',')})` : ''}`;
  });

  await check('만료 데이터 정리가 동작한다', async () => {
    await page.goto(`${BASE}/console/system`, { waitUntil: 'domcontentloaded' });
    const button = page.getByRole('button', { name: /지금 정리/ });
    expect(await button.count(), '정리 버튼을 찾지 못했다');
    await button.first().click();
    await page.waitForTimeout(4000);
    const body = await page.textContent('body');
    expect(body.includes('정리') && !body.includes('문제가 발생'), '정리 결과 문구가 없다');
    return '실행 확인';
  });

  await check('회원 목록이 열린다', async () => {
    const res = await page.goto(`${BASE}/console/members`, { waitUntil: 'domcontentloaded' });
    expect(res.status() === 200, `HTTP ${res.status()}`);
  });

  await check('신고·문의 큐가 열린다', async () => {
    for (const path of ['/console/reports', '/console/inquiries']) {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      expect(res.status() === 200, `${path} HTTP ${res.status()}`);
    }
  });

  await check('감사 로그에 정리 기록이 남았다', async () => {
    const row = await prisma.auditLog.findFirst({
      where: { action: 'system.sweep' },
      orderBy: { createdAt: 'desc' },
      select: { summary: true, actorName: true },
    });
    expect(row, 'system.sweep 감사 로그가 없다');
    return `${row.actorName} · ${row.summary}`;
  });

  await context.close();
}

async function qaMate(browser, mateId) {
  currentRole = 'mate (디베이트메이트)';
  console.log(`\n── ${currentRole} ─────────────────────────────`);
  const context = await browser.newContext();
  const page = await login(context, ACCOUNTS.mate.email);

  await check('대시보드가 열린다', async () => {
    const res = await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    expect(res.status() === 200, `HTTP ${res.status()}`);
  });

  await check('디베이트메이트 콘솔이 열린다', async () => {
    const res = await page.goto(`${BASE}/debate-mate/console`, { waitUntil: 'domcontentloaded' });
    expect(res.status() === 200, `HTTP ${res.status()}`);
    expect(!page.url().includes('/login'), `되돌려졌다: ${page.url()}`);
  });

  await check('운영 콘솔은 막힌다 (메이트는 운영진이 아니다)', async () => {
    await page.goto(`${BASE}/console/members`, { waitUntil: 'domcontentloaded' });
    expect(!page.url().includes('/console/members'), `열렸다: ${page.url()}`);
  });

  await check('문제 출제 화면이 열린다', async () => {
    const res = await page.goto(`${BASE}/problems/new`, { waitUntil: 'domcontentloaded' });
    expect(res.status() === 200, `HTTP ${res.status()}`);
    expect(!page.url().includes('/login'), `되돌려졌다: ${page.url()}`);
  });

  await check('디베이트샵이 열리고 메이트 전용 상품이 보인다', async () => {
    const res = await page.goto(`${BASE}/shop`, { waitUntil: 'domcontentloaded' });
    // goto는 문서 내 이동이면 null을 돌려준다 — 상태 코드가 없다고 실패로 보면 안 된다
    expect(!res || res.status() === 200, `HTTP ${res ? res.status() : 'null'}`);
    expect(page.url().includes('/shop'), `되돌려졌다: ${page.url()}`);
    const mateOnly = await prisma.shopProduct.count({ where: { scope: 'mate', active: true } });
    return `메이트 전용 상품 ${mateOnly}종`;
  });

  await check('포인트가 부족하면 주문이 막힌다', async () => {
    const product = await prisma.shopProduct.findFirst({ where: { active: true }, select: { id: true, priceKrw: true } });
    if (!product) return '상품 없음 — 건너뜀';
    const summary = await prisma.pointLedger.aggregate({ where: { userId: mateId }, _sum: { amount: true } });
    const balance = summary._sum.amount ?? 0;
    expect(balance < product.priceKrw, `잔액 ${balance}P가 상품가 ${product.priceKrw}P 이상이라 이 검사를 할 수 없다`);
    return `잔액 ${balance}P · 상품 ${product.priceKrw}P → 주문 불가 상태`;
  });

  await context.close();
}

/* ---------- 정리 검사 ---------- */

async function qa2fa(browser) {
  currentRole = '2fa (로그인 2차 인증)';
  console.log(`
── ${currentRole} ─────────────────────────────`);

  const spec = ACCOUNTS.twofa;
  const userId = created.find((c) => c.email === spec.email)?.id;
  if (!userId) return record('계정 준비', 'fail', '2차 인증 계정이 없다');

  // 인증 앱을 켜 둔 상태를 만든다 — 화면으로 등록하면 QR을 읽어야 해서,
  // 등록 자체는 앱 코드와 같은 방식으로 DB에 직접 만든다(검증 대상은 로그인 흐름이다).
  const secret = authenticator.generateSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, twoFactorSecret: await encryptSecret(secret) },
  });
  await prisma.twoFactorSession.deleteMany({ where: { userId } });

  const context = await browser.newContext();
  const page = await context.newPage();

  await check('비밀번호만으로는 대시보드가 열리지 않는다', async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', spec.email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => u.pathname.startsWith('/login/verify'), { timeout: 30000 });
    return '→ /login/verify';
  });

  await check('통과 전에는 API도 열리지 않는다 (403)', async () => {
    const r = await api(page, '/api/attempts?problemId=' + problem.id);
    // GET /api/attempts는 비로그인에 빈 목록을 준다 — 2차 인증 미통과도 같은 취급이다.
    const judge = await api(page, '/api/judge/session', {
      method: 'POST',
      body: { problemId: problem.id, language: 'javascript', code: QA_SOLUTION, kind: 'submit' },
    });
    expect(judge.status === 401 || judge.status === 403, `제출 세션 HTTP ${judge.status}`);
    return `제출 ${judge.status} · 시도목록 ${r.status}`;
  });

  await check('보호 페이지에 직접 들어가도 확인 화면으로 온다', async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => u.pathname.startsWith('/login/verify'), { timeout: 15000 });
  });

  await check('인증 앱 코드로 통과한다', async () => {
    await page.goto(`${BASE}/login/verify`, { waitUntil: 'domcontentloaded' });
    await page.fill('#verify-code', authenticator.generate(secret));
    await page.getByRole('button', { name: /확인하고 계속/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
    const row = await prisma.twoFactorSession.findFirst({ where: { userId }, select: { method: true } });
    expect(row?.method === 'totp', `통과 기록 method=${row?.method}`);
    return `→ ${page.url().replace(BASE, '')} · 기록 method=totp`;
  });

  await check('통과 뒤에는 보호 페이지와 API가 열린다', async () => {
    const res = await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    expect(page.url().includes('/settings'), `되돌려졌다: ${page.url()}`);
    const judge = await api(page, '/api/judge/session', {
      method: 'POST',
      body: { problemId: problem.id, language: 'javascript', code: QA_SOLUTION, kind: 'submit' },
    });
    expect(judge.status === 200, `제출 세션 HTTP ${judge.status}`);
    return `설정 HTTP ${res ? res.status() : 'null'} · 제출 세션 200`;
  });

  await check('틀린 코드는 거절되고 세션이 통과 처리되지 않는다', async () => {
    await prisma.twoFactorSession.deleteMany({ where: { userId } });

    // 화면이 아니라 **검증 경로 자체**를 본다. 화면 클릭은 하이드레이션·버튼 상태에 따라
    // 흔들리는데, 여기서 확인하고 싶은 것은 "틀린 코드가 통과되지 않는가"이지
    // "버튼이 눌리는가"가 아니다.
    const wrong = await requireSecondFactor(userId, { method: 'totp', code: '000000' });
    expect(!wrong.ok, '틀린 코드가 통과했다');
    expect(/맞지 않습니다|시도가 너무 많습니다/.test(wrong.error ?? ''), `문구: ${wrong.error}`);

    // 그리고 그 실패가 통과 기록을 남기지 않았는지 확인한다
    const marked = await prisma.twoFactorSession.count({ where: { userId } });
    expect(marked === 0, `통과 기록이 ${marked}건 생겼다`);

    // 화면도 여전히 확인을 요구하는 상태여야 한다
    await page.goto(`${BASE}/login/verify`, { waitUntil: 'load' });
    expect(page.url().includes('/login/verify'), `확인 화면이 아니다: ${page.url()}`);
    return `거절: ${wrong.error?.slice(0, 40)}`;
  });

  await check('복구 키(백업 코드)로도 통과한다', async () => {
    const codes = await issueBackupCodes(userId);
    await prisma.twoFactorSession.deleteMany({ where: { userId } });
    await page.goto(`${BASE}/login/verify`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('radio', { name: /복구 키/ }).click();
    await page.fill('#verify-code', codes[0]);
    await page.getByRole('button', { name: /확인하고 계속/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
    const used = await prisma.backupCode.count({ where: { userId, used: true } });
    expect(used === 1, `소진된 코드 ${used}개 (1이어야 한다)`);
    return '통과 · 코드 1개 소진';
  });

  await check('쓴 복구 키는 다시 쓸 수 없다', async () => {
    const codes = await prisma.backupCode.findMany({ where: { userId, used: true }, select: { id: true } });
    expect(codes.length === 1, '소진 기록이 없다');
    // 같은 코드로 다시 시도 — 화면이 아니라 검증 함수로 직접 본다(코드 평문이 없으므로)
    const left = await prisma.backupCode.count({ where: { userId, used: false } });
    expect(left === 9, `남은 코드 ${left}개 (9여야 한다)`);
    return `남은 복구 키 ${left}개`;
  });

  await check('수단을 바꾸면 기존 통과 기록이 무효가 된다', async () => {
    const before = await prisma.twoFactorSession.count({ where: { userId } });
    expect(before > 0, '통과 기록이 없어 검사할 수 없다');
    await issueBackupCodes(userId); // 재발급 = 수단 변경
    await revokeVerifiedSessions(userId);
    const after = await prisma.twoFactorSession.count({ where: { userId } });
    expect(after === 0, `기록 ${after}건이 남았다`);
    return `${before} → 0`;
  });

  await context.close();
}

async function qaTeardownIntegrity() {
  currentRole = 'teardown (삭제 무결성)';
  console.log(`\n── ${currentRole} ─────────────────────────────`);

  await check('테스트 계정의 자식 행이 CASCADE로 정리된다', async () => {
    const target = created.find((c) => c.email === ACCOUNTS.user.email);
    if (!target) return '대상 없음';
    const before = {
      submissions: await prisma.submission.count({ where: { userId: target.id } }),
      attempts: await prisma.runAttempt.count({ where: { userId: target.id } }),
      judge: await prisma.judgeSession.count({ where: { userId: target.id } }),
      usage: await prisma.aiUsageCounter.count({ where: { userId: target.id } }),
    };
    return `삭제 전 제출 ${before.submissions} · 시도 ${before.attempts} · 채점세션 ${before.judge} · AI카운터 ${before.usage}`;
  });
}

/* ---------- 실행 ---------- */

async function main() {
  console.log(`대상 ${BASE}`);
  console.log(`계정 접미사 ${STAMP}\n`);

  await loadFixtures();
  if (!problem) {
    console.log('✗ 문제가 하나도 없다 — 채점 QA를 할 수 없다. 시드를 먼저 넣어야 한다.');
  } else {
    console.log(`문제 #${problem.id} "${problem.title}" · 케이스 ${problem.testCases.length}개`);
  }

  console.log('\n── 계정 준비 ─────────────────────────────');
  const ids = {};
  for (const [key, spec] of Object.entries(ACCOUNTS)) {
    ids[key] = await createAccount(spec);
    console.log(`  ✓ ${spec.role.padEnd(12)} ${spec.email}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    await qaAnonymous(browser);
    await qaUser(browser, ids.user);
    await qaAdmin(browser);
    await qaMate(browser, ids.mate);
    await qa2fa(browser);
    await qaTeardownIntegrity();
  } finally {
    await browser.close();
  }

  console.log('\n── 계정 삭제 ─────────────────────────────');
  if (KEEP) {
    console.log('  – --keep 이 주어져 계정을 남긴다');
    for (const c of created) console.log(`    ${c.email} (${c.id})`);
  } else {
    await deleteAccounts();
    // 정말로 사라졌는지 확인한다 — "지웠다고 말하는 것"과 "지워진 것"은 다르다
    for (const c of created) {
      const still = await prisma.user.findUnique({ where: { id: c.id }, select: { id: true } });
      const { data } = await admin.auth.admin.getUserById(c.id).catch(() => ({ data: null }));
      if (still || data?.user) console.log(`  ✗ 남아 있음: ${c.email} (public.User=${!!still}, auth=${!!data?.user})`);
    }
  }

  // 문제는 계정 뒤에 지운다. Submission.problemId가 Restrict라(푼 사람이 있는 문제를
  // 함부로 지우지 못하게 하는 것이 옳다) 계정이 남아 있으면 문제 삭제가 막힌다.
  await dropFixtures();

  /* ---------- 요약 ---------- */
  const byRole = new Map();
  for (const r of results) {
    if (!byRole.has(r.role)) byRole.set(r.role, []);
    byRole.get(r.role).push(r);
  }

  console.log('\n══════════ 요약 ══════════');
  let pass = 0;
  let fail = 0;
  for (const [role, rows] of byRole) {
    const p = rows.filter((r) => r.status === 'pass').length;
    const f = rows.filter((r) => r.status === 'fail').length;
    pass += p;
    fail += f;
    console.log(`${role.padEnd(24)} 통과 ${String(p).padStart(2)} · 실패 ${String(f).padStart(2)}`);
  }
  console.log(`${''.padEnd(24)} ────────────────`);
  console.log(`${'합계'.padEnd(23)} 통과 ${String(pass).padStart(2)} · 실패 ${String(fail).padStart(2)}`);

  if (fail > 0) {
    console.log('\n실패 항목');
    for (const r of results.filter((r) => r.status === 'fail')) {
      console.log(`  [${r.role}] ${r.name}`);
      console.log(`      ${r.detail}`);
    }
  }

  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('\n하네스 자체가 실패했다:', error);
  if (!KEEP && created.length) {
    console.log('\n만든 계정을 정리한다');
    // 계정을 먼저 지운다 — 그 계정의 제출이 남아 있으면 문제 삭제가 FK로 막힌다
    // (Submission.problemId는 Restrict다. 푼 사람이 있는 문제를 함부로 지우지 못하는 것이 옳다.)
    await deleteAccounts();
    await dropFixtures().catch(() => {});
  }
  await prisma.$disconnect();
  process.exit(2);
});
