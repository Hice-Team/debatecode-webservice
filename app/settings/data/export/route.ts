// 내 데이터 전체 내보내기 — 개인정보처리방침의 "이용자의 권리"(열람·전송요구)를
// 화면에서 바로 행사하는 자리다. GDPR 20조가 요구하는 "구조화되고 기계가 읽을 수 있는
// 형식"에 맞춰 JSON 한 파일로 내려보낸다.
//
// 서버 액션이 아니라 라우트 핸들러인 이유 — 서버 액션은 파일을 내려보내지 못한다.
// 액션이 Blob을 만들어 클라이언트로 넘기면 데이터 전체가 한 번 메모리에 올라가고,
// 브라우저에서 다시 링크를 만들어야 한다. 여기서는 응답 자체가 파일이다.
//
// 암호화 저장된 항목(생년월일·성별·전공 등)은 **복호화해서** 담는다. 본인에게 돌려주는
// 자기 정보이고, 알아볼 수 없는 형태로 주면 전송요구권을 형식만 채운 것이 된다.
// 반대로 남의 정보가 섞이는 값(API 키·토큰 해시·다른 사람의 글)은 담지 않는다.
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { decryptSecret } from '@/app/lib/crypto';
import { durableRateLimit, retryAfterLabel } from '@/app/lib/rate-limit-durable';

/** 내보내기 한도 — 한 번에 담는 행 수. 계정 하나가 DB를 통째로 긁어가지 않게 한다. */
const MAX_ROWS = 2000;

export async function GET() {
  const { userId, email } = await verifySession();

  // 전체 조회는 무거운 질의다 — 새로고침 연타로 DB를 밀어붙이지 못하게 막는다.
  const gate = await durableRateLimit(`data-export:${userId}`, 3, 60 * 60 * 1000);
  if (!gate.allowed) {
    return new Response(
      `내보내기는 1시간에 3번까지 할 수 있습니다. ${retryAfterLabel(gate.retryAfterMs)} 후에 다시 시도해 주세요.`,
      { status: 429, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  const take = MAX_ROWS;
  const [
    user,
    submissions,
    runAttempts,
    posts,
    comments,
    bookmarks,
    aiSessions,
    debateChats,
    interviews,
    points,
    loginEvents,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true, createdAt: true,
        avatarUrl: true, anonymousTag: true, starScore: true,
        preferredLanguage: true, emailNotifications: true, rankBadgeVisible: true,
        interests: true, profileCompleted: true,
        consentAt: true, aiTermsAgreedAt: true, aiTrainingConsentAt: true,
        marketingConsentAt: true, emailVerifiedAt: true, twoFactorEnabled: true,
        birthdate: true, gender: true, position: true, major: true, referralSource: true,
      },
    }),
    prisma.submission.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take,
      select: { id: true, problemId: true, language: true, status: true, passedCount: true, totalCount: true, runtimeMs: true, code: true, createdAt: true },
    }),
    prisma.runAttempt.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take,
      select: { id: true, problemId: true, language: true, status: true, kind: true, passedCount: true, totalCount: true, createdAt: true },
    }),
    prisma.post.findMany({
      where: { authorId: userId }, orderBy: { createdAt: 'desc' }, take,
      select: { id: true, board: true, title: true, content: true, url: true, anonymous: true, secret: true, viewCount: true, createdAt: true, updatedAt: true },
    }),
    prisma.comment.findMany({
      where: { authorId: userId }, orderBy: { createdAt: 'desc' }, take,
      select: { id: true, postId: true, content: true, anonymous: true, createdAt: true, updatedAt: true },
    }),
    prisma.bookmark.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take,
      select: { problemId: true, createdAt: true },
    }),
    prisma.aiSession.findMany({
      where: { userId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: {
        id: true, title: true, model: true, createdAt: true, updatedAt: true,
        messages: { orderBy: { createdAt: 'asc' }, select: { role: true, content: true, createdAt: true } },
      },
    }),
    prisma.debateAiChat.findMany({
      where: { userId }, orderBy: { updatedAt: 'desc' }, take: 200,
      select: { problemId: true, scope: true, model: true, messages: true, createdAt: true, updatedAt: true },
    }),
    prisma.interviewSession.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 200,
      select: { id: true, submissionId: true, status: true, round: true, defenseScore: true, messages: true, report: true, createdAt: true },
    }),
    prisma.pointLedger.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take,
      select: { amount: true, kind: true, memo: true, createdAt: true },
    }),
    prisma.loginEvent.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 500,
      select: { ipMasked: true, userAgent: true, isNew: true, createdAt: true },
    }),
  ]);

  // 가입 위저드에서 받은 민감 항목 — 본인 것이므로 알아볼 수 있는 형태로 되돌린다
  const [birthdate, gender, position, major, referralSource] = await Promise.all([
    decryptSecret(user.birthdate),
    decryptSecret(user.gender),
    decryptSecret(user.position),
    decryptSecret(user.major),
    decryptSecret(user.referralSource),
  ]);

  const payload = {
    _meta: {
      service: 'debateCode',
      exportedAt: new Date().toISOString(),
      account: email,
      format: 'debatecode-export/1',
      note: '개인정보처리방침의 열람·전송요구권에 따라 내려받은 본인 데이터입니다. 각 목록은 최신순 최대 ' + MAX_ROWS + '건입니다.',
    },
    profile: { ...user, birthdate, gender, position, major, referralSource },
    submissions,
    runAttempts,
    posts,
    comments,
    bookmarks,
    aiSessions,
    debateAiChats: debateChats,
    interviews,
    points,
    loginEvents,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="debatecode-data-${stamp}.json"`,
      // 내려받은 파일이 중간 캐시에 남지 않게 한다 — 계정 전체가 담긴 파일이다
      'cache-control': 'no-store, private',
    },
  });
}
