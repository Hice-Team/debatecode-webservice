// 설정 화면 런타임 점검 — 데이터 제어 / 계정 및 보안 / 일반 / 개인 맞춤 / AI / 로컬 연동
import { chromium } from 'playwright';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../app/lib/prisma';

const BASE = process.env.QA_BASE ?? 'http://localhost:3100';
const STAMP = Date.now().toString(36);
const EMAIL = `qa-settings-${STAMP}@debatecode.org`;
const PASSWORD = 'QaFlow!2026#x';

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 점검용 계정을 만든다 — 가입 위저드는 이 점검의 대상이 아니라 준비물이다
const { data: created, error: createErr } = await supa.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { name: 'QA 설정' },
});
if (createErr) throw new Error('계정 생성 실패: ' + createErr.message);
const QA_ID = created.user.id;
await prisma.user.upsert({
  where: { id: QA_ID },
  create: { id: QA_ID, email: EMAIL, name: 'QA 설정' },
  update: {},
});
await prisma.user.update({
  where: { id: QA_ID },
  data: { profileCompleted: true, aiOnboarded: true, consentAt: new Date(), aiTermsAgreedAt: new Date() },
});
console.log('점검 계정 ' + EMAIL);

let pass = 0;
let fail = 0;
const notes = [];
function ok(label, extra = '') {
  pass++;
  console.log(`  ✓ ${label}${extra ? ' — ' + extra : ''}`);
}
function no(label, extra = '') {
  fail++;
  console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`);
  notes.push(label + (extra ? ' — ' + extra : ''));
}

/** 조건 하나를 검사한다 — 통과·실패 문구는 같은 라벨을 쓴다 */
function expect(condition, label, extra = '') {
  if (condition) ok(label, extra);
  else no(label, extra);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
// 바깥 서비스의 실패는 이 점검의 대상이 아니다 —
//   supabase.co/auth/v1/sso  프로젝트에 SSO를 켜지 않아 404 (정상)
//   api.channel.io           개발 환경에는 상담 플러그인 키가 없어 401 (정상)
// 우리 코드에서 난 것만 센다.
const EXTERNAL = /supabase\.co|channel\.io|googleapis|gstatic/;
page.on('response', (r) => {
  if (r.status() >= 400 && !EXTERNAL.test(r.url())) errors.push(`${r.status()} ${r.url()}`);
});
page.on('console', (m) => {
  // 콘솔의 "Failed to load resource"는 위 response 훅이 이미 잡는다 — 두 번 세지 않는다
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
    errors.push('console: ' + m.text().slice(0, 160));
  }
});

async function openCategory(label) {
  await page.getByRole('button', { name: label, exact: false }).first().click();
  await page.waitForTimeout(600);
}

try {
  // ── 로그인 ──
  console.log('\n[로그인]');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1500);
  expect(!page.url().includes('/login'), '로그인', page.url().includes('/login') ? page.url() : '');

  // ── 설정 진입 ──
  console.log('\n[설정 진입]');
  const res = await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (res.status() === 200) ok('GET /settings 200');
  else no('GET /settings', String(res.status()));

  const cats = await page.locator('nav[aria-label="설정 분류"] button').allTextContents();
  console.log('    카테고리:', cats.map((c) => c.trim()).join(' · '));
  if (cats.some((c) => c.includes('계정 및 보안'))) ok('보안+계정 병합 탭 존재');
  else no('보안+계정 병합 탭');
  expect(!cats.some((c) => c.includes('계정') && !c.includes('보안')), '옛 "계정" 탭 제거됨');

  // ── 데이터 제어 ──
  console.log('\n[데이터 제어]');
  await openCategory('데이터 제어');
  const hasExport = await page.locator('a[href="/settings/data/export"]').count();
  expect(hasExport, '전체 내보내기 링크');

  const exportRes = await page.request.get(`${BASE}/settings/data/export`);
  if (exportRes.status() === 200) {
    const disp = exportRes.headers()['content-disposition'] ?? '';
    const body = await exportRes.json();
    const keys = Object.keys(body);
    ok('내보내기 200', `${keys.length}개 묶음 · ${disp.includes('attachment') ? '첨부' : '본문'}`);
    expect(body._meta && body.profile, '내보내기 내용', keys.join(','));
    if (body.profile?.aiApiKey === undefined) ok('API 키는 담기지 않음');
    else no('API 키가 담김');
  } else {
    no('내보내기', String(exportRes.status()));
  }

  const consentSwitch = page.getByRole('switch', { name: /AI 모델 개선/ });
  expect((await consentSwitch.count()), '학습 활용 토글');

  // 계정 기록 개수 표시
  const countRows = await page.locator('dl dt').allTextContents();
  if (countRows.length >= 7) ok('계정 기록 개수 표', `${countRows.length}종`);
  else no('계정 기록 개수 표', String(countRows.length));

  // 삭제 확인창 — 확인 문구 없이는 못 지우는지
  await page.getByRole('button', { name: '골라서 지우기' }).click();
  await page.waitForTimeout(500);
  const dialog = page.getByRole('dialog');
  if ((await dialog.count())) ok('삭제 확인창 열림');
  else no('삭제 확인창');
  const delBtn = dialog.getByRole('button', { name: /지우기$/ });
  if ((await delBtn.isDisabled())) ok('선택 전 삭제 버튼 잠김');
  else no('선택 전 삭제 버튼이 열려 있음');
  // 한 종류 고르고도 확인 문구 없으면 잠겨 있어야 한다
  const firstBox = dialog.locator('input[name="types"]:not([disabled])').first();
  if (await firstBox.count()) {
    await firstBox.check();
    await page.waitForTimeout(200);
    if ((await delBtn.isDisabled())) ok('확인 문구 없이 삭제 잠김');
    else no('확인 문구 없이 삭제 가능');
  } else {
    ok('지울 기록 없음 — 모든 항목 비활성', '(계정에 기록 없음)');
  }
  // Esc로 닫히는지
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  if ((await page.getByRole('dialog').count()) === 0) ok('Esc로 확인창 닫힘');
  else no('Esc로 닫히지 않음');

  // 캐시 정리 창
  await page.getByRole('button', { name: '캐시 정리' }).click();
  await page.waitForTimeout(500);
  const cacheGroups = await page.getByRole('dialog').locator('label').count();
  if (cacheGroups >= 4) ok('캐시 종류 목록', `${cacheGroups}종`);
  else no('캐시 종류 목록', String(cacheGroups));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ── 계정 및 보안 ──
  console.log('\n[계정 및 보안]');
  await openCategory('계정 및 보안');
  const secText = await page.locator('section[aria-live="polite"]').innerText();
  for (const [label, needle] of [
    ['로그인 수단 묶음', '로그인 수단'],
    ['소셜 연동', '연결된 소셜 계정'],
    ['비밀번호 변경', '비밀번호 변경'],
    ['이메일 인증', '이메일 인증'],
    ['2단계 인증', '2단계 인증'],
    ['활동 묶음', '로그인된 기기'],
    ['위험 구역', '위험 구역'],
    ['회원 탈퇴', '회원 탈퇴'],
  ]) {
    expect(secText.includes(needle), label);
  }
  expect((await page.locator('a[href="/settings/security/log"]').count()), '보안 로그 CSV 링크');
  const logRes = await page.request.get(`${BASE}/settings/security/log`);
  if (logRes.status() === 200) {
    const csv = await logRes.text();
    if (csv.includes('IP(마스킹)')) ok('보안 로그 CSV 내용', `${csv.split('\n').length - 1}행`);
    else no('보안 로그 CSV 내용');
  } else {
    no('보안 로그 CSV', String(logRes.status()));
  }
  expect((await page.getByRole('button', { name: /다른 기기/ }).count()), '세션 강제 로그아웃 버튼');
  if ((await page.getByRole('button', { name: /보안키|등록/ }).count())) ok('보안키(WebAuthn) 관리');
  else no('보안키 관리');

  // ── 일반 ──
  console.log('\n[일반]');
  await openCategory('일반');
  const genText = await page.locator('section[aria-live="polite"]').innerText();
  for (const [label, needle] of [
    ['시간대', '시간대'],
    ['날짜 표기', '날짜 표기'],
    ['국가', '국가'],
    ['에디터 글자 크기', '글자 크기'],
    ['들여쓰기 폭', '들여쓰기 폭'],
    ['에디터 글꼴', '글꼴'],
    ['자동 완성', '자동 완성 추천'],
    ['알림 채널', '내 글에 달린 답글'],
  ]) {
    expect(genText.includes(needle), label);
  }
  const modelSelectors = await page.locator('select#aiCodeModel').count();
  if (modelSelectors === 0) ok('중복 모델 패널 제거됨');
  else no('일반 탭에 모델 패널이 남음', String(modelSelectors));
  const switches = await page.getByRole('switch').count();
  if (switches >= 8) ok('토글 스위치 통일', `${switches}개`);
  else no('토글 개수', String(switches));

  // 실제 저장 — 시간대를 바꾸고 하단 바로 저장
  await page.selectOption('select#timezone', 'Asia/Tokyo');
  await page.waitForTimeout(400);
  const saveBar = page.getByRole('button', { name: '변경 사항 저장' });
  if (await saveBar.isVisible()) {
    ok('하단 저장 바가 올라옴');
    await saveBar.click();
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await openCategory('일반');
    const tz = await page.locator('select#timezone').inputValue();
    if (tz === 'Asia/Tokyo') ok('시간대 저장·복원', tz);
    else no('시간대 저장', tz);
    // 되돌리기
    await page.selectOption('select#timezone', '');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '변경 사항 저장' }).click();
    await page.waitForTimeout(2000);
  } else {
    no('하단 저장 바가 올라오지 않음');
  }

  // ── 개인 맞춤 ──
  console.log('\n[개인 맞춤 설정]');
  await openCategory('개인 맞춤 설정');
  const proText = await page.locator('section[aria-live="polite"]').innerText();
  for (const [label, needle] of [
    ['프로필 이미지', '프로필 이미지'],
    ['기본 이미지로', '이미지 고르기'],
    ['가입 정보', '가입 정보'],
    ['가입일', '가입일'],
    ['공개 범위', '공개 범위'],
    ['학습 목표', '지금의 목표'],
    ['AI 답변 언어', 'AI가 답할 언어'],
  ]) {
    expect(proText.includes(needle), label);
  }
  // 목표 저장
  const goalInput = page.locator('input#profileGoal');
  if (await goalInput.count()) {
    await goalInput.fill('QA 점검용 목표');
    await page.getByRole('button', { name: /공개 범위/ }).click();
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const dash = await page.locator('body').innerText();
    if (dash.includes('QA 점검용 목표')) ok('목표가 대시보드에 표시');
    else no('목표가 대시보드에 없음');
    // 정리
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await openCategory('개인 맞춤 설정');
    await page.locator('input#profileGoal').fill('');
    await page.getByRole('button', { name: /공개 범위/ }).click();
    await page.waitForTimeout(2000);
  } else {
    no('목표 입력칸 없음');
  }

  // ── AI 설정 ──
  console.log('\n[AI 설정]');
  await openCategory('AI 설정');
  const aiText = await page.locator('section[aria-live="polite"]').innerText();
  for (const [label, needle] of [
    ['기본 모델 2종', '기본 모델'],
    ['면접·리팩토링 모델', '면접 · 리팩토링'],
    ['AI Search 모델', 'AI Search'],
    ['지침', 'AI에게 늘 전할 지침'],
    ['맥락 양', '함께 보낼 대화의 양'],
    ['대화 관리', '대화 관리'],
  ]) {
    expect(aiText.includes(needle), label);
  }
  if ((await page.locator('select#aiSearchModel').count())) ok('AI Search 기본 모델 셀렉터');
  else no('AI Search 셀렉터');

  // 지침 추가 → 저장 → 복원
  const instInput = page.getByLabel('새 지침');
  if (await instInput.count()) {
    await instInput.fill('QA: 답보다 힌트를 먼저 주세요');
    await page.getByRole('button', { name: '추가', exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'AI 설정 저장' }).click();
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await openCategory('AI 설정');
    const after = await page.locator('section[aria-live="polite"]').innerText();
    if (after.includes('QA: 답보다 힌트를')) ok('지침 저장·복원');
    else no('지침이 저장되지 않음');
    // 정리 — 빼고 다시 저장
    const removeBtn = page.getByRole('button', { name: /지침 빼기/ }).first();
    if (await removeBtn.count()) {
      await removeBtn.click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'AI 설정 저장' }).click();
      await page.waitForTimeout(2000);
      ok('지침 개별 제거');
    }
  } else {
    no('지침 입력칸 없음');
  }

  // ── 로컬 연동 ──
  console.log('\n[로컬 연동]');
  await openCategory('로컬 연동');
  const intText = await page.locator('section[aria-live="polite"]').innerText();
  for (const [label, needle] of [
    ['로컬 LLM 엔드포인트', '로컬 LLM 엔드포인트'],
    ['MCP', 'debateNetwork'],
    ['파일시스템 동기화', '파일시스템 동기화'],
    ['준비 중 표시', '준비 중'],
    ['대안 안내', '지금은'],
  ]) {
    expect(intText.includes(needle), label);
  }

  // ── 접근성 (회귀) ──
  console.log('\n[접근성 회귀]');
  await openCategory('접근성 및 표시');
  const a11y = await page.getByRole('switch').count();
  if (a11y >= 2) ok('접근성 스위치 유지', `${a11y}개`);
  else no('접근성 스위치', String(a11y));

  // ── 반응형 ──
  console.log('\n[반응형 375px]');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow <= 1) ok('가로 스크롤 없음', `${overflow}px`);
  else no('가로 넘침', `${overflow}px`);

  // ── 에디터 반영 (회귀) ──
  console.log('\n[문제 풀이 화면 회귀]');
  await page.setViewportSize({ width: 1440, height: 960 });
  const probs = await page.request.get(`${BASE}/problems`);
  if (probs.status() === 200) ok('GET /problems 200');
  else no('GET /problems', String(probs.status()));

  console.log('\n[콘솔 오류]');
  const real = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  if (real.length === 0) ok('콘솔 오류 없음');
  else no('콘솔 오류', real.slice(0, 3).join(' | '));
} catch (e) {
  no('QA 중단', String(e.message).slice(0, 200));
} finally {
  await browser.close();
  // 뒷정리 — 점검이 남긴 계정은 지운다
  await prisma.user.delete({ where: { id: QA_ID } }).catch(() => {});
  await supa.auth.admin.deleteUser(QA_ID).catch(() => {});
  await prisma.$disconnect().catch(() => {});
  console.log(`\n통과 ${pass} · 실패 ${fail}`);
  if (notes.length) {
    console.log('\n실패 목록:');
    for (const n of notes) console.log('  - ' + n);
  }
  process.exit(fail > 0 ? 1 : 0);
}
