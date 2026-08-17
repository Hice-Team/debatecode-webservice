'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { rateLimit, clientIp } from '../rate-limit';
import { mapAuthError } from '../auth-errors';

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
  if (!rateLimit(`login:${await clientIp()}`, 10, 5 * 60_000)) {
    return { errors: { form: ['로그인 시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.'] } };
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
  if (!rateLimit(`pwreset:${await clientIp()}`, 3, 10 * 60_000)) {
    return { errors: { form: ['요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.'] } };
  }

  const parsed = emailSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const site = await origin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${site}/auth/confirm?next=/reset-password`,
  });

  if (error) {
    return { errors: { form: [mapAuthError(error)] } };
  }

  return { sent: true };
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
