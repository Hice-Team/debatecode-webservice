'use server';

// 로그인 2차 인증 — 비밀번호를 통과한 세션이 마지막 한 걸음을 넘는 자리.
//
// 여기서는 verifySession()을 쓸 수 없다. 그 함수가 통과하지 못한 세션을 이 화면으로
// 되돌려 보내므로, 이 화면이 그것을 쓰면 무한 고리가 된다. 대신 getPendingSession()으로
// "로그인은 됐다"까지만 확인한다.
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getPendingSession } from '../dal';
import {
  getTwoFactorState,
  markSessionVerified,
  requireSecondFactor,
  sendRecoveryEmailCode,
  type SecondFactorProof,
} from '../two-factor';
import { maskIp } from '../security';

export interface LoginTwoFactorState {
  error?: string;
  /** 복구 이메일로 코드를 보낸 뒤의 안내 */
  notice?: string;
  /** 개발 환경에서 메일 발송이 꺼져 있을 때만 — 운영에서는 절대 나가지 않는다 */
  devCode?: string;
}

/** 돌아갈 곳 — 열린 리다이렉트가 되지 않게 내부 경로만 허용한다. */
function safeNext(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  // 확인 화면으로 되돌아오는 값은 무한 고리가 된다
  if (value.startsWith('/login')) return '/dashboard';
  return value;
}

/**
 * 코드(또는 보안키)를 확인하고 이 세션을 통과 처리한다.
 *
 * 성공하면 곧바로 원래 가려던 곳으로 보낸다 — 확인만 하고 다시 누르게 만들면
 * 이용자는 통과했는지 알 수 없다.
 */
export async function verifyLoginSecondFactor(
  _prev: LoginTwoFactorState,
  formData: FormData,
): Promise<LoginTwoFactorState> {
  const pending = await getPendingSession();
  if (!pending) redirect('/login');

  const next = safeNext(String(formData.get('next') ?? ''));
  const method = String(formData.get('method') ?? 'totp');

  let proof: SecondFactorProof | null = null;
  if (method === 'webauthn') {
    const raw = String(formData.get('assertion') ?? '').trim();
    if (!raw) return { error: '보안키 확인을 먼저 진행해 주세요.' };
    try {
      proof = { method: 'webauthn', response: JSON.parse(raw) };
    } catch {
      return { error: '보안키 응답을 읽지 못했습니다. 다시 시도해 주세요.' };
    }
  } else {
    const code = String(formData.get('code') ?? '').trim();
    if (!code) return { error: '코드를 입력해 주세요.' };
    if (method === 'backup') proof = { method: 'backup', code };
    else if (method === 'recovery_email') proof = { method: 'recovery_email', code };
    else proof = { method: 'totp', code };
  }

  const result = await requireSecondFactor(pending.userId, proof);
  if (!result.ok) return { error: result.error };

  if (!pending.sessionId) {
    // 토큰에 session_id가 없다 — 통과를 기록할 자리가 없으므로 통과시킬 수 없다.
    // (Supabase 설정이 바뀌면 생길 수 있는 상태라 조용히 넘기지 않는다.)
    return { error: '세션을 확인하지 못했습니다. 다시 로그인해 주세요.' };
  }

  const h = await headers();
  await markSessionVerified({
    sessionId: pending.sessionId,
    userId: pending.userId,
    method: proof.method,
    userAgent: h.get('user-agent'),
    ipMasked: maskIp(h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'),
  });

  redirect(next);
}

/** 복구 이메일로 코드를 보낸다 — 인증 앱을 잃었을 때의 길. */
export async function sendLoginRecoveryCode(
  _prev: LoginTwoFactorState,
  _formData: FormData,
): Promise<LoginTwoFactorState> {
  const pending = await getPendingSession();
  if (!pending) redirect('/login');

  const result = await sendRecoveryEmailCode(pending.userId);
  if (!result.ok) return { error: result.error };

  return {
    notice: `${result.sentTo}로 6자리 코드를 보냈습니다. 10분 안에 입력해 주세요.`,
    ...(result.devCode ? { devCode: result.devCode } : {}),
  };
}

/** 화면이 어떤 수단을 띄울지 정하는 데 쓴다. */
export async function getLoginTwoFactorOptions(): Promise<{
  totp: boolean;
  securityKeys: number;
  backupCodesLeft: number;
  recoveryEmail: string | null;
}> {
  const pending = await getPendingSession();
  if (!pending) redirect('/login');
  const state = await getTwoFactorState(pending.userId);
  return {
    totp: state.totp,
    securityKeys: state.securityKeys,
    backupCodesLeft: state.backupCodesLeft,
    recoveryEmail: state.recoveryEmail,
  };
}
