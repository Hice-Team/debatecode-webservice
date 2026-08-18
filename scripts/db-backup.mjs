// 운영 DB 스냅샷 — 파괴적 정리 전에 남기는 백업.
//
// pg_dump를 쓸 수 없는 환경이라(로컬에 postgres 클라이언트 없음) 표별로 전량 SELECT해
// JSON으로 떨어뜨린다. 복구는 이 JSON을 읽어 INSERT하는 식이 된다 — 완전한 논리 백업은
// 아니지만, "지우기 전에 무엇이 있었는지"를 되찾을 수 있으면 목적은 충족한다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

const TABLES = [
  'User', 'Problem', 'TestCase', 'Submission', 'RunAttempt', 'InterviewSession',
  'DebateQSession', 'DebateAiChat', 'Post', 'Comment', 'PostLike', 'Attachment',
  'PollVote', 'Bookmark', 'Workbook', 'WorkbookItem', 'Announcement', 'Course',
  'Lesson', 'LessonProgress', 'PointLedger', 'PointRequest', 'ShopProduct',
  'ShopOrder', 'Report', 'Inquiry', 'Sanction', 'ProblemDraft',
  'DebateMateApplication', 'LoginEvent', 'BackupCode', 'WebauthnKey',
  'ProblemSet', 'ProblemSetItem', 'LaunchNotify', 'MarketingContact',
  'EmailCampaign', 'AiSession', 'AiMessage',
  'AppSetting', 'AuditLog', 'PermissionGrant', 'CannedResponse',
];

const client = new pg.Client({ connectionString: env.DIRECT_URL || env.DATABASE_URL });
await client.connect();

const out = { takenAt: new Date().toISOString(), tables: {} };
for (const t of TABLES) {
  try {
    const { rows } = await client.query(`SELECT * FROM "${t}"`);
    out.tables[t] = rows;
    console.log(`${t}: ${rows.length}`);
  } catch (error) {
    console.log(`${t}: SKIP (${error.message.slice(0, 60)})`);
  }
}

// auth.users는 Prisma 밖이라 따로 — 비밀번호 해시는 제외한다
const { rows: authUsers } = await client.query(
  `SELECT id, email, created_at, raw_user_meta_data, raw_app_meta_data, email_confirmed_at
   FROM auth.users`,
);
out.authUsers = authUsers;
console.log(`auth.users: ${authUsers.length}`);

await client.end();

mkdirSync('backups', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const path = `backups/snapshot-${stamp}.json`;
writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
console.log(`\n저장: ${path}`);
