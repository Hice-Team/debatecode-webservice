'use server';

// 이메일 인증코드 서버 액션 — 가입 확인, 복구 이메일 등록.
import { revalidatePath } from 'next/cache';
import { getUser, getSessionOptional } from '../dal';
import { prisma } from '../prisma';
import { audit } from '../audit';
import { clientIp, rateLimit } from '../rate-limit';
import { issueCode, verifyCode, type VerificationPurpose } from '../verification';

export interface CodeState {
  sent?: boolean;
  verified?: boolean;
  error?: string;
  notice?: string;
}

/* ---------- 발급 ---------- */

export async function sendVerificationCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const purpose = String(formData.get('purpose') ?? '') as VerificationPurpose;
  if (!['signup', 'recovery_email', 'email_change'].includes(purpose)) {
    return { error: '알 수 없는 요청입니다.' };
  }

  const email = String(formData.get('email') ?? '').trim();
  const session = await getSessionOptional();

  // 로그인 계정이 필요한 목적은 세션을 요구한다
  if (purpose !== 'signup' && !session) return { error: '로그인이 필요합니다.' };

  // IP 기준 제한 — 남의 주소로 코드를 뿌리는 데 쓰이지 않게
  const ip = await clientIp();
  if (!rateLimit(`verify-send:${ip}`, 10, 600_000)) {
    return { error: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' };
  }

  // 복구 이메일은 로그인 계정 자신의 주소와 같으면 의미가 없다 —
  // 본 계정 메일함을 잃었을 때 쓰는 것이기 때문이다.
  if (purpose === 'recovery_email' && session) {
    const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
    if (me && me.email.toLowerCase() === email.toLowerCase()) {
      return { error: '가입 이메일과 다른 주소를 등록해 주세요. 본 계정 메일을 잃었을 때 쓰는 주소입니다.' };
    }
  }

  const result = await issueCode(email, purpose, session?.userId);
  if (!result.ok) return { error: result.error };

  return {
    sent: true,
    notice: result.dryRun
      ? `메일 발송이 꺼져 있어 실제로 보내지 않았습니다. 개발용 코드: ${result.devCode}`
      : '인증 코드를 보냈습니다. 메일함을 확인해 주세요.',
  };
}

/* ---------- 확인 ---------- */

/**
 * 복구 이메일 등록 — 코드 확인에 성공해야 저장된다.
 *
 * "입력했다"와 "실제로 받아볼 수 있다"는 다르다. 오타가 난 주소를 복구 수단으로 믿고 있다가
 * 정작 계정을 잃었을 때 아무것도 못 하는 상황을 막으려고 검증을 강제한다.
 */
export async function confirmRecoveryEmail(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const user = await getUser();
  const email = String(formData.get('email') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();
  if (!email || !code) return { error: '이메일과 코드를 모두 입력해 주세요.' };

  const result = await verifyCode(email, 'recovery_email', code);
  if (!result.ok) return { error: result.error };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorRecoveryEmail: email.toLowerCase(),
      twoFactorRecoveryEmailVerifiedAt: new Date(),
    },
  });

  await audit({
    actor: user,
    action: 'security.recovery_email',
    targetType: 'user',
    targetId: user.id,
    summary: '복구 이메일 등록·확인 완료',
  });

  revalidatePath('/settings/security');
  return { verified: true, notice: '복구 이메일이 등록되었습니다.' };
}

/** 복구 이메일 해제 */
export async function removeRecoveryEmail(): Promise<void> {
  const user = await getUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorRecoveryEmail: null, twoFactorRecoveryEmailVerifiedAt: null },
  });
  await audit({
    actor: user,
    action: 'security.recovery_email',
    targetType: 'user',
    targetId: user.id,
    summary: '복구 이메일 해제',
  });
  revalidatePath('/settings/security');
}
