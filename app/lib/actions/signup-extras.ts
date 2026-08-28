'use server';

// 가입 직후의 선택 설정 — 이메일 인증 · API 키.
//
// 왜 가입 절차에 넣지 않고 마지막에 "선택"으로 두는가.
// 이메일 인증을 가입 필수 단계로 두었을 때 문제가 컸다. 코드가 오지 않으면 가입 자체가
// 막혔고, 그 실패는 우리 로그에도 남지 않아 몇 명이 못 들어왔는지조차 알 수 없었다.
// 그렇다고 인증이 쓸모없는 것은 아니다 — 중고 거래는 인증한 계정만 할 수 있고,
// 비밀번호를 잊었을 때 되찾는 길이기도 하다.
//
// 그래서 순서를 뒤집었다. 계정을 먼저 만들고, 인증은 원할 때 보낸다.
//
// ── 무엇이 고쳐졌는가 ───────────────────────────────────────────────────────
// 이 파일은 원래 Supabase의 `auth.resend({type:'signup'})`를 불렀다. 두 가지가 잘못돼 있었다.
//
//   1. 가입이 `admin.createUser({ email_confirm: true })`로 계정을 **즉시 확정** 생성한다.
//      그래서 `user.email_confirmed_at`은 항상 채워져 있고, 이 함수는 그 값을 먼저 보고
//      "이미 인증된 이메일입니다"만 돌려줬다 — **메일을 한 통도 보내지 않았다.**
//      이용자에게는 "인증 메일 보내기를 눌렀는데 아무것도 안 온다"로 보인다.
//   2. 설령 도달했더라도 Supabase가 보내는 것은 **링크**이지 우리 6자리 코드가 아니다.
//      링크는 메일 클라이언트가 미리 열어 소모해 버리는 사고가 있어서, 이 저장소는
//      애초에 코드 방식(app/lib/verification.ts)을 따로 만들어 두었다.
//      그 코드 시스템은 복구 이메일에만 쓰이고 있었다.
//
// 이제 같은 코드 시스템을 쓴다. 확인에 성공하면 `User.emailVerifiedAt`에 시각을 남기고,
// 인증 여부를 묻는 자리는 전부 그 값을 본다.
import { verifySession } from '../dal';
import { prisma } from '../prisma';
import { rateLimit } from '../rate-limit';
import { durableRateLimit, retryAfterLabel } from '../rate-limit-durable';
import { issueCode, verifyCode } from '../verification';

export interface SignupExtraState {
  ok?: string;
  error?: string;
  /** 코드를 보낸 뒤에만 true — 화면이 입력란을 연다 */
  sent?: boolean;
}

/**
 * 인증 코드 보내기.
 *
 * 이미 확인한 계정에는 보내지 않는다. 같은 메일이 또 오면 이용자는 인증이 안 된 줄 안다.
 */
export async function sendVerificationEmail(): Promise<SignupExtraState> {
  const { userId, email } = await verifySession();

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true, email: true },
  });
  if (me?.emailVerifiedAt) return { ok: '이미 인증된 이메일입니다.' };

  // 같은 아이솔레이트 안의 연타를 먼저 끊고,
  if (!rateLimit(`verify-mail:${userId}`, 3, 60_000)) {
    return { error: '잠시 후 다시 시도해 주세요.' };
  }
  // 인스턴스가 바뀌어도 남는 카운터로 하루 총량을 묶는다 — 메일 발송은 비용이 든다.
  const gate = await durableRateLimit(`verify-mail:${userId}`, 10, 60 * 60 * 1000);
  if (!gate.allowed) {
    return { error: `발송이 너무 잦습니다. ${retryAfterLabel(gate.retryAfterMs)} 뒤에 다시 시도해 주세요.` };
  }

  const target = me?.email ?? email;
  const result = await issueCode(target, 'signup', userId);
  if (!result.ok) return { error: result.error };

  if (result.dryRun) {
    // 발송 수단이 없는 개발 환경 — 코드를 화면에 그대로 보여 준다.
    // 운영에서는 이 분기에 오지 않는다(issueCode가 devCode를 채우지 않는다).
    return { sent: true, ok: `메일 발송이 꺼져 있습니다. 개발용 코드: ${result.devCode}` };
  }
  return { sent: true, ok: `${target}로 6자리 인증 코드를 보냈습니다. 10분 안에 입력해 주세요.` };
}

/**
 * 코드 확인 — 성공하면 인증 시각을 남긴다.
 *
 * 이 값이 곧 "이 주소를 실제로 받아볼 수 있다"의 근거가 된다. 중고거래 판매자 배지와
 * 멘토게시판의 인증 계정 전용 답변이 이 값을 본다.
 */
export async function confirmVerificationEmail(
  _prev: SignupExtraState,
  formData: FormData,
): Promise<SignupExtraState> {
  const { userId } = await verifySession();

  const code = String(formData.get('code') ?? '').trim();
  if (!/^\d{6}$/.test(code)) return { sent: true, error: '6자리 숫자를 입력해 주세요.' };

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!me) return { error: '계정 정보를 찾지 못했습니다.' };
  if (me.emailVerifiedAt) return { ok: '이미 인증된 이메일입니다.' };

  const result = await verifyCode(me.email, 'signup', code);
  if (!result.ok) return { sent: true, error: result.error };

  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return { ok: '이메일 인증이 끝났습니다.' };
}

/** 현재 계정의 이메일 인증 여부 — 가입 마무리 화면과 설정 화면이 상태를 보여 주는 데 쓴다. */
export async function getEmailVerified(): Promise<boolean> {
  const { userId } = await verifySession();
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true },
  });
  return !!me?.emailVerifiedAt;
}
