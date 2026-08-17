// 미번역 한국어 문구 스캐너 — 주석을 제외한 JSX/속성 문자열 중
// I18nSlot / t() 를 거치지 않는 한국어 라인을 파일별로 집계한다.
//
//   npx tsx scripts/i18n-scan.mts                 전체 요약
//   npx tsx scripts/i18n-scan.mts app/study       해당 경로의 라인 목록
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'generated' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p.split('\\').join('/'));
  }
  return out;
}

const HANGUL = /[가-힣]/;
const rows: { file: string; line: number; text: string }[] = [];

for (const file of walk('app')) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inBlock = false;
  lines.forEach((raw, i) => {
    let line = raw;
    if (inBlock) {
      if (line.includes('*/')) {
        line = line.slice(line.indexOf('*/') + 2);
        inBlock = false;
      } else return;
    }
    if (line.includes('/*')) {
      const before = line.slice(0, line.indexOf('/*'));
      if (!line.includes('*/')) inBlock = true;
      line = before;
    }
    const s = line.indexOf('//');
    if (s >= 0 && line[s - 1] !== ':') line = line.slice(0, s);
    const jc = line.indexOf('{/*');
    if (jc >= 0) line = line.slice(0, jc);
    if (!HANGUL.test(line)) return;
    if (/I18nSlot|\bt\(['"]/.test(line)) return; // 이미 번역 경로를 타는 줄
    rows.push({ file, line: i + 1, text: raw.trim().slice(0, 100) });
  });
}

const byFile = new Map<string, number>();
for (const r of rows) byFile.set(r.file, (byFile.get(r.file) ?? 0) + 1);
console.log('미번역 후보 라인:', rows.length, '/ 파일:', byFile.size);
console.log('');
[...byFile.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([f, n]) => console.log(String(n).padStart(4), f));

if (process.argv[2]) {
  console.log('\n--- ' + process.argv[2] + ' ---');
  rows.filter((r) => r.file.includes(process.argv[2])).forEach((r) => console.log(r.line, '|', r.text));
}
