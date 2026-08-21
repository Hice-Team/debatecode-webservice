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
import { verifySession } from '../dal';
import { createClient } from '../supabase/server';
import { rateLimit } from '../rate-limit';

export interface SignupExtraState {
  ok?: string;
  error?: string;
}

/**
 * 이메일 인증 메일 보내기 — 선택.
 *
 * Supabase의 재발송을 그대로 쓴다. 이미 인증된 계정이면 보내지 않고 그 사실을 알린다
 * (같은 메일이 또 오면 이용자는 인증이 안 된 줄 안다).
 */
export async function sendVerificationEmail(): Promise<SignupExtraState> {
  const { userId, email } = await verifySession();

  // 메일 발송은 비용이 드는 동작이라 넉넉히 잡아도 분당 3회면 충분하다
  if (!rateLimit(`verify-mail:${userId}`, 3, 60_000)) {
    return { error: '잠시 후 다시 시도해 주세요.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email_confirmed_at) {
    return { ok: '이미 인증된 이메일입니다.' };
  }

  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) {
    return { error: '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  return { ok: `${email}로 인증 메일을 보냈습니다. 메일함을 확인해 주세요.` };
}

/** 현재 계정의 이메일 인증 여부 — 가입 마무리 화면이 상태를 보여 주는 데 쓴다. */
export async function getEmailVerified(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user?.email_confirmed_at;
}
