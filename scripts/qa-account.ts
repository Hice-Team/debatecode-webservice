// QA 점검용 계정 생성 / 삭제.
//
//   npx tsx --env-file=.env scripts/qa-account.ts create
//   npx tsx --env-file=.env scripts/qa-account.ts delete
//
// 로그인해야 열리는 화면(설정·대시보드)은 익명으로 검사할 수 없다. 실제 계정으로 눌러 봐야
// 서버 컴포넌트 예외처럼 로그인 뒤에만 드러나는 문제를 잡을 수 있다.
// 점검이 끝나면 delete로 지운다 — 운영 DB에 정체불명의 계정을 남기지 않는다.
import { PrismaClient } from '../app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const EMAIL = 'qa-check@debatecode.org';
const PASSWORD = 'QaCheck!2026';

async function findAuthUser() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users.find((u) => u.email === EMAIL) ?? null;
}

async function create() {
  let authUser = await findAuthUser();
  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    authUser = data.user;
    console.log('auth 사용자 생성:', authUser!.id);
  } else {
    // 비밀번호를 다시 맞춰 둔다(이전 실행에서 달랐을 수 있다)
    await admin.auth.admin.updateUserById(authUser.id, { password: PASSWORD, email_confirm: true });
    console.log('auth 사용자 재사용:', authUser.id);
  }

  await prisma.user.upsert({
    where: { id: authUser!.id },
    create: { id: authUser!.id, email: EMAIL, name: 'QA 점검' },
    update: { email: EMAIL, name: 'QA 점검' },
  });
  console.log(`준비 완료 — ${EMAIL} / ${PASSWORD}`);
}

async function remove() {
  const authUser = await findAuthUser();
  if (!authUser) {
    console.log('삭제할 계정이 없습니다.');
    return;
  }
  await prisma.user.delete({ where: { id: authUser.id } }).catch(() => null);
  await admin.auth.admin.deleteUser(authUser.id);
  console.log('삭제 완료:', EMAIL);
}

const cmd = process.argv[2];
const run = cmd === 'delete' ? remove : create;

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
