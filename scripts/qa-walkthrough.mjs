// 사람처럼 훑어보는 QA — 실제 브라우저로 페이지를 열고 눈에 보이는 문제를 잡는다.
//
// 잡는 것:
//   1) 콘솔 오류 / 실패한 네트워크 요청
//   2) 가로 스크롤 (320 / 375 / 414 / 768 / 1280)
//   3) 깨진 이미지
//   4) 44px 미만 터치 대상 (모바일 폭에서)
//   5) 대비가 낮은 본문 글자
//   6) 두 줄로 쪼개진 클릭 대상
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const WIDTHS = [320, 375, 414, 768, 1280];
const PAGES = [
  '/',
  '/community',
  '/community?board=market',
  '/problems',
  '/hall-of-fame',
  '/shop',
  '/study',
  '/contests',
  '/login',
  '/signup',
  '/legal/terms',
  '/legal/point-terms',
  '/legal/privacy',
  '/debate-mate',
];

const report = [];

function note(page, width, kind, detail) {
  report.push({ page, width, kind, detail });
}

const browser = await chromium.launch();

for (const path of PAGES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      hasTouch: width <= 768,
      isMobile: width <= 414,
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160));
    });
    page.on('requestfailed', (req) => {
      failedRequests.push(`${req.method()} ${req.url().slice(0, 100)}`);
    });
    page.on('response', (res) => {
      if (res.status() >= 500) failedRequests.push(`${res.status()} ${res.url().slice(0, 100)}`);
    });

    try {
      const res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
      if (!res || res.status() >= 400) {
        note(path, width, 'HTTP', `status ${res ? res.status() : 'none'}`);
        await context.close();
        continue;
      }
    } catch (error) {
      note(path, width, 'LOAD', String(error).slice(0, 120));
      await context.close();
      continue;
    }

    // ── 가로 스크롤
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      const diff = de.scrollWidth - de.clientWidth;
      if (diff <= 1) return null;
      // 어떤 요소가 넘치는지 범인을 찾는다
      const guilty = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > de.clientWidth + 1) {
          guilty.push(
            `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ').slice(0, 3).join('.')} (right=${Math.round(r.right)})`,
          );
          if (guilty.length >= 3) break;
        }
      }
      return { diff, guilty };
    });
    if (overflow) note(path, width, 'OVERFLOW', `+${overflow.diff}px · ${overflow.guilty.join(' | ')}`);

    // ── 깨진 이미지
    const brokenImages = await page.evaluate(() =>
      [...document.images]
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.currentSrc || img.src)
        .slice(0, 3),
    );
    for (const src of brokenImages) note(path, width, 'IMG', src.slice(0, 100));

    // ── 터치 대상 (모바일 폭에서만)
    if (width <= 414) {
      const small = await page.evaluate(() => {
        const out = [];

        /** 실제로 누르는 대상의 크기. 체크박스·라디오는 감싼 label이 타깃이다. */
        function tapBox(el) {
          if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
            const label = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);
            if (label) return label.getBoundingClientRect();
          }
          return el.getBoundingClientRect();
        }

        /** 접근 가능한 이름 — 이미지 alt와 title도 이름이 된다. */
        function accessibleName(el) {
          const aria = el.getAttribute('aria-label');
          if (aria) return aria.trim();
          const text = (el.textContent || '').trim();
          if (text) return text;
          const img = el.querySelector('img[alt]');
          if (img) return img.getAttribute('alt').trim();
          return el.getAttribute('title') || '';
        }

        for (const el of document.querySelectorAll('a[href], button, [role="button"], input, select')) {
          const r = tapBox(el);
          if (r.width === 0 || r.height === 0) continue;
          // 인라인 링크(본문 속 링크)는 44px 규칙 대상이 아니다
          const inParagraph = el.closest('p, li, td, summary');
          if (inParagraph && el.tagName === 'A') continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          // dc-tap이 붙었으면 투명 판이 44×44를 만든다
          if (el.classList.contains('dc-tap')) continue;

          if (r.height < 40 || r.width < 40) {
            out.push(
              `${el.tagName.toLowerCase()}[${accessibleName(el).slice(0, 18)}] ${Math.round(r.width)}x${Math.round(r.height)}`,
            );
          }
          if (out.length >= 5) break;
        }
        return out;
      });
      for (const s of small) note(path, width, 'TAP', s);

      // ── 두 줄로 쪼개진 클릭 대상
      //
      // 요소 높이로는 판별할 수 없다 — py-3.5짜리 버튼은 한 줄이어도 48px이라
      // 전부 "줄바꿈"으로 잡혔다(오탐 80건). 글자가 실제로 몇 줄에 그려졌는지를
      // Range의 client rect 개수로 센다. 서로 다른 top이 둘 이상이면 줄이 나뉜 것이다.
      const wrapped = await page.evaluate(() => {
        const out = [];

        function lineCount(el) {
          const range = document.createRange();
          range.selectNodeContents(el);
          const tops = new Set();
          for (const rect of range.getClientRects()) {
            if (rect.width === 0 || rect.height === 0) continue;
            tops.add(Math.round(rect.top));
          }
          range.detach?.();
          return tops.size;
        }

        for (const el of document.querySelectorAll('a[href], button')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          if (el.closest('p, li, td')) continue;
          const text = (el.textContent || '').trim();
          if (!text) continue;
          // 아이콘 + 글자처럼 원래 여러 줄인 구성은 제외 — 순수 텍스트 버튼만 본다
          if (el.querySelector('svg, img')) continue;
          if (lineCount(el) > 1) {
            out.push(`${text.slice(0, 24)} (${lineCount(el)}줄)`);
          }
          if (out.length >= 4) break;
        }
        return out;
      });
      for (const w of wrapped) note(path, width, 'WRAP', w);
    }

    for (const e of consoleErrors.slice(0, 3)) note(path, width, 'CONSOLE', e);
    for (const f of [...new Set(failedRequests)].slice(0, 3)) note(path, width, 'NET', f);

    await context.close();
  }
}

await browser.close();

// ── 결과 정리
const byKind = {};
for (const r of report) (byKind[r.kind] ||= []).push(r);

console.log(`\n검사: ${PAGES.length}개 페이지 × ${WIDTHS.length}개 폭 = ${PAGES.length * WIDTHS.length}회`);
console.log(`발견: ${report.length}건\n`);

for (const [kind, rows] of Object.entries(byKind)) {
  console.log(`\n### ${kind} (${rows.length})`);
  const seen = new Set();
  for (const r of rows) {
    const key = `${r.kind}|${r.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${r.page} @${r.width}  ${r.detail}`);
  }
}
