'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { clientIp } from '../rate-limit';
import { durableRateLimit, retryAfterLabel } from '../rate-limit-durable';
import { mapAuthError } from '../auth-errors';
import { prisma } from '../prisma';
import { createAdminClient } from '../supabase/admin';
import { consumeResetToken, issueResetLink } from '../verification';

export interface AuthFormState {
  errors?: {
    email?: string[];
    password?: string[];
    form?: string[];
  };
}

export interface RequestResetState {
  errors?: { email?: string[]; form?: string[] };
  sent?: boolean;
  /** 메일이 꺼진 개발 환경에서만 — 운영에서는 절대 채워지지 않는다 */
  devUrl?: string;
}

export interface UpdatePasswordState {
  errors?: { password?: string[]; form?: string[] };
}

// naver는 Supabase 내장 프로바이더가 아니라서 커스텀 OAuth2 라우트(/api/auth/naver/*)로 처리한다.
export type OAuthProvider =
  | 'google'
  | 'naver'
  | 'kakao'
  | 'github'
  | 'discord'
  | 'twitter'
  | 'facebook'
  | 'linkedin_oidc';

const PASSWORD_RULES = z
  .string()
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .regex(/[a-zA-Z]/, '비밀번호에 영문자가 포함되어야 합니다.')
  .regex(/[0-9]/, '비밀번호에 숫자가 포함되어야 합니다.');

const loginSchema = z.object({
  email: z.email('올바른 이메일 형식이 아닙니다.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
});

const emailSchema = z.object({
  email: z.email('올바른 이메일 형식이 아닙니다.'),
});

const passwordSchema = z.object({ password: PASSWORD_RULES });

async function origin() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host');
  return `${proto}://${host}`;
}

// 회원가입은 다단계 위저드로 대체 — app/lib/actions/signup.ts 참조.

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  // 무차별 대입 방어는 인스턴스가 바뀌어도 횟수가 남아야 한다 — DB에 센다.
  // 이메일까지 키에 넣지 않는 이유: 한 IP가 여러 계정을 훑는 것도 같은 공격이다.
  const loginLimit = await durableRateLimit(`login:${await clientIp()}`, 10, 5 * 60_000);
  if (!loginLimit.allowed) {
    return {
      errors: {
        form: [`로그인 시도가 너무 잦습니다. ${retryAfterLabel(loginLimit.retryAfterMs)} 후에 다시 시도해 주세요.`],
      },
    };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { errors: { form: [mapAuthError(error)] } };
  }

  redirect('/dashboard');
}

// 소셜 로그인 — Supabase 프로젝트에 해당 프로바이더가 활성화되어 있어야 동작한다.
// <form action={signInWithOAuth.bind(null, provider)}>에서 직접 사용되므로 반환 없이 항상 리다이렉트한다.
export async function signInWithOAuth(provider: OAuthProvider): Promise<void> {
  // 네이버는 커스텀 OAuth2 라우트로 위임
  if (provider === 'naver') redirect('/api/auth/naver/start');

  const supabase = await createClient();
  const site = await origin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    // naver 등 비내장 프로바이더는 Supabase가 validation_failed로 거부 → 사용자 메시지로 매핑됨
    provider: provider as Parameters<typeof supabase.auth.signInWithOAuth>[0]['provider'],
    options: { redirectTo: `${site}/auth/callback` },
  });

  if (error || !data.url) {
    redirect(`/login?oauthError=${encodeURIComponent(error ? mapAuthError(error) : '소셜 로그인을 시작할 수 없습니다.')}`);
  }

  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

export async function requestPasswordReset(
  _prev: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  // 재설정 메일은 남의 주소로도 보낼 수 있으므로 괴롭힘 수단이 된다 — 엄격하게 센다
  const resetLimit = await durableRateLimit(`pwreset:${await clientIp()}`, 3, 10 * 60_000);
  if (!resetLimit.allowed) {
    return {
      errors: {
        form: [`요청이 너무 잦습니다. ${retryAfterLabel(resetLimit.retryAfterMs)} 후에 다시 시도해 주세요.`],
      },
    };
  }

  const parsed = emailSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  // 무차별 요청 방어 — 남의 주소로 메일 폭탄을 보내는 통로가 되면 안 된다.
  const ip = await clientIp();
  const gate = await durableRateLimit(`pwreset:${ip}`, 5, 15 * 60_000);
  if (!gate.allowed) {
    return {
      errors: { form: [`요청이 너무 잦습니다. ${retryAfterLabel(gate.retryAfterMs)} 후에 다시 시도해 주세요.`] },
    };
  }

  // 계정이 있으면 링크를 보내고, 없으면 아무것도 하지 않는다.
  // **어느 쪽이든 화면에는 똑같이 "보냈다"고 답한다** — 응답이 갈리면
  // 이 폼이 곧 "그 주소가 가입돼 있는지" 알려 주는 조회창이 된다.
  const account = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true },
  });

  if (account) {
    const result = await issueResetLink(account.email, account.id, await origin());
    // 발송 자체가 실패한 것은 이용자 잘못이 아니다 — 그때는 알린다.
    if (!result.ok) return { errors: { form: [result.error ?? '메일 발송에 실패했습니다.'] } };
    if (result.dryRun) {
      // 메일이 꺼진 개발 환경 — 링크를 화면에 보여 주지 않으면 흐름이 막힌다.
      return { sent: true, devUrl: result.devUrl };
    }
  }

  return { sent: true };
}

/**
 * 메일로 받은 링크에서 새 비밀번호를 설정한다.
 *
 * 세션이 없는 상태라 관리자 키로 바꾼다 — 이 경로의 유일한 신뢰 근거는
 * "그 메일함을 열 수 있다"이고, 그 확인은 consumeResetToken이 끝낸다.
 * 토큰은 확인하는 순간 소모되므로 같은 링크를 다시 쓸 수 없다.
 */
export async function resetPasswordWithToken(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const ip = await clientIp();
  const gate = await durableRateLimit(`pwreset-set:${ip}`, 10, 15 * 60_000);
  if (!gate.allowed) {
    return { errors: { form: [`시도가 너무 잦습니다. ${retryAfterLabel(gate.retryAfterMs)} 후에 다시 시도해 주세요.`] } };
  }

  const parsed = passwordSchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const email = String(formData.get('email') ?? '');
  const token = String(formData.get('token') ?? '');
  const consumed = await consumeResetToken(email, token);
  if (!consumed.ok || !consumed.userId) {
    return { errors: { form: [consumed.error ?? '링크가 올바르지 않습니다.'] } };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(consumed.userId, {
    password: parsed.data.password,
  });
  if (error) return { errors: { form: [mapAuthError(error)] } };

  // 비밀번호가 바뀌었으면 기존 세션은 모두 끊는다 — 계정을 빼앗긴 상황에서
  // 되찾는 경로가 이것이라, 침입자의 세션이 살아 있으면 되찾은 것이 아니다.
  await admin.auth.admin.signOut(consumed.userId, 'global').catch(() => {});

  redirect('/login?reset=1');
}

export async function updatePassword(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const parsed = passwordSchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { errors: { form: [mapAuthError(error)] } };
  }

  redirect('/dashboard');
}
