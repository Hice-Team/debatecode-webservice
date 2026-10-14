// 스키마 드리프트 점검 — schema.prisma에는 있는데 DB에는 없는 컬럼을 찾는다.
//   npx tsx --env-file=.env scripts/check-schema-drift.ts
//
// 이 저장소는 `prisma db push`를 쓰지 않고 manual-additive.sql로 컬럼을 더한다
// (auth 스키마를 건드리지 않으려는 의도적 선택). 대신 SQL 한 줄을 빠뜨리면
// 스키마와 DB가 조용히 어긋나고, 그 컬럼을 읽는 화면만 런타임에 터진다(Prisma P2022).
// 배포 전에 이 스크립트로 확인한다.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '../app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** schema.prisma에서 모델별 스칼라 컬럼을 뽑는다(관계·블록 속성 제외). */
function parseModels(source: string): Map<string, string[]> {
  const models = new Map<string, string[]>();
  const blocks = source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);

  for (const [, name, body] of blocks) {
    const columns: string[] = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('///') || line.startsWith('@@')) continue;
      const m = /^(\w+)\s+([\w.]+)(\[\])?/.exec(line);
      if (!m) continue;
      const [, field, type, isList] = m;
      // 관계 필드(대문자로 시작하는 모델 타입)와 목록은 컬럼이 아니다
      if (isList) continue;
      if (/^[A-Z]/.test(type) && !/^(String|Int|Float|Boolean|DateTime|Json|Bytes|Decimal|BigInt)$/.test(type)) {
        continue;
      }
      if (line.includes('@relation')) continue;
      columns.push(field);
    }
    models.set(name, columns);
  }
  return models;
}

async function main() {
  const source = readFileSync('prisma/schema.prisma', 'utf8');
  const models = parseModels(source);

  const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    -- ::text 캐스팅 — information_schema는 sql_identifier 타입을 돌려주는데
    -- pg 어댑터가 그 타입을 매핑하지 못한다(UnsupportedNativeDataType).
    SELECT table_name::text AS table_name, column_name::text AS column_name
    FROM information_schema.columns WHERE table_schema = 'public'`;

  const dbColumns = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!dbColumns.has(r.table_name)) dbColumns.set(r.table_name, new Set());
    dbColumns.get(r.table_name)!.add(r.column_name);
  }

  let problems = 0;
  for (const [model, columns] of models) {
    const actual = dbColumns.get(model);
    if (!actual) {
      console.log(`표 없음: ${model}`);
      problems += 1;
      continue;
    }
    const missing = columns.filter((c) => !actual.has(c));
    if (missing.length > 0) {
      console.log(`${model}: 컬럼 없음 → ${missing.join(', ')}`);
      problems += missing.length;
    }
  }

  console.log(problems === 0 ? '\n드리프트 없음 — 스키마와 DB가 일치합니다.' : `\n총 ${problems}건`);
  process.exitCode = problems === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
