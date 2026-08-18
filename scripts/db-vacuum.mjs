// 삭제 후 정리 — 죽은 튜플 회수 + 플래너 통계 갱신.
// VACUUM은 트랜잭션 안에서 못 돌아서 MCP(execute_sql)로는 실행되지 않는다. 직접 연결한다.
// VACUUM FULL은 쓰지 않는다 — 테이블 전체를 잠그므로 운영 중에는 위험하다.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const client = new pg.Client({ connectionString: env.DIRECT_URL || env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
);
for (const { tablename } of rows) {
  await client.query(`VACUUM (ANALYZE) "${tablename}"`);
  process.stdout.write(`${tablename} `);
}
console.log('\n\n-- 정리 후 크기 --');
const { rows: sizes } = await client.query(`
  SELECT s.relname AS t,
         pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
         n_live_tup AS live, n_dead_tup AS dead
  FROM pg_stat_user_tables s
  JOIN pg_class c ON c.oid = s.relid
  WHERE s.schemaname = 'public'
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 12`);
console.table(sizes);
await client.end();
