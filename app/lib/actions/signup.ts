'use server';

// 다단계 가입 위저드 서버 액션.
// 흐름: 약관 동의(클라이언트 상태) → 이메일 인증(클라이언트) → 계정 정보(서버) → 프로필(서버) → 완료.
// 소셜 가입은 동의 상태를 쿠키로 보존한 뒤 OAuth 왕복 → 콜백에서 동의 기록 → 계정 단계부터 재개.
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { prisma } from '../prisma';
import { assertEnabled, featureBlockMessage } from '../settings';
import { addMarketingConsent } from '../marketing';
import { rateLimit, clientIp } from '../rate-limit';
import { mapAuthError } from '../auth-errors';
import { encryptSecret } from '../crypto';
import type { OAuthProvider } from './auth';
import {
  GENDER_VALUES,
  POSITION_VALUES,
  INTEREST_VALUES,
  REFERRAL_VALUES,
  MAX_INTERESTS,
  SIGNUP_CONSENT_COOKIE,
} from '@/app/(auth)/signup/options';

export interface ConsentState {
  errors?: { form?: string[] };
  recorded?: boolean;
}

export interface AccountStepState {
  errors?: {
    nickname?: string[];
    password?: string[];
    passwordConfirm?: string[];
    birthdate?: string[];
    gender?: string[];
    form?: string[];
  };
  saved?: boolean;
}

export interface ProfileStepState {
  errors?: {
    position?: string[];
    major?: string[];
    interests?: string[];
    referral?: string[];
    form?: string[];
  };
  saved?: boolean;
  nickname?: string; // 환영 단계 인사말용
}

const PASSWORD_RULES = z
  .string()
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .regex(/[a-zA-Z]/, '비밀번호에 영문자가 포함되어야 합니다.')
  .regex(/[0-9]/, '비밀번호에 숫자가 포함되어야 합니다.');

const birthdateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '생년월일을 선택해 주세요.')
  .refine((v) => !Number.isNaN(Date.parse(v)), '올바른 날짜가 아닙니다.')
  .refine((v) => {
    const age = (Date.now() - Date.parse(v)) / (365.25 * 24 * 3600 * 1000);
    return age >= 14;
  }, '만 14세 이상만 가입할 수 있습니다.')
  .refine((v) => {
    const age = (Date.now() - Date.parse(v)) / (365.25 * 24 * 3600 * 1000);
    return age <= 120;
  }, '올바른 생년월일을 입력해 주세요.');

const accountSchema = z.object({
  nickname: z.string().trim().min(2, '닉네임은 2자 이상이어야 합니다.').max(20, '닉네임은 20자 이하여야 합니다.'),
  birthdate: birthdateSchema,
  gender: z.string().refine((v) => GENDER_VALUES.includes(v as (typeof GENDER_VALUES)[number]), '성별을 선택해 주세요.'),
});

const profileSchema = z.object({
  position: z
    .string()
    .refine((v) => POSITION_VALUES.includes(v as (typeof POSITION_VALUES)[number]), '포지션을 선택해 주세요.'),
  major: z.string().trim().max(40, '전공은 40자 이하로 입력해 주세요.').optional(),
  interests: z
    .array(z.string())
    .min(1, '관심 태그를 1개 이상 선택해 주세요.')
    .max(MAX_INTERESTS, `관심 태그는 최대 ${MAX_INTERESTS}개까지 선택할 수 있습니다.`)
    .refine(
      (arr) => arr.every((v) => INTEREST_VALUES.includes(v as (typeof INTEREST_VALUES)[number])),
      '올바르지 않은 태그가 포함되어 있습니다.',
    ),
  referral: z
    .string()
    .refine((v) => REFERRAL_VALUES.includes(v as (typeof REFERRAL_VALUES)[number]), '접하게 된 경로를 선택해 주세요.'),
});

// 위저드 액션 공통 — 현재 세션 사용자를 확인한다 (없으면 null)
async function sessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const SESSION_EXPIRED = '세션이 만료되었습니다. 처음부터 다시 시도해 주세요.';

/** 1단계 — 약관 동의를 기록한다. */
export async function recordSignupConsent(_prev: ConsentState, formData: FormData): Promise<ConsentState> {
  // 가입 킬 스위치 — 가입 스팸이 쏟아질 때 콘솔에서 끈다.
  // 위저드의 첫 단계에서 막아야 어중간하게 만들어진 계정이 남지 않는다.
  const blocked = await featureBlockMessage('flag.signup', '현재 신규 가입을 받지 않고 있습니다.');
  if (blocked) return { errors: { form: [blocked] } };

  const { user } = await sessionUser();
  if (!user) return { errors: { form: [SESSION_EXPIRED] } };

  const marketing = formData.get('marketing') === 'on';
  await prisma.user.updateMany({
    where: { id: user.id, consentAt: null },
    data: { consentAt: new Date(), ...(marketing ? { marketingConsentAt: new Date() } : {}) },
  });
  // 동의했으면 발송 명단에도 올린다 — 콘솔의 홍보 메일은 이 명단만 본다
  if (marketing && user.email) {
    await addMarketingConsent({ email: user.email, userId: user.id, source: 'signup' });
  }
  return { recorded: true };
}

/** 2단계 완료 시 — 인증 코드 검증 후 세션이 이미 생성되었으므로, 동의 정보를 DB에 기록한다. */
export async function completeSignupConsent(email: string, token: string, marketing: boolean): Promise<{ verified: boolean; error?: string }> {
  // 인증 코드는 클라이언트에서 verifyOtp로 처리한다. 
  // 이 함수는 DB 업데이트(동의 기록)만 담당한다.
  const { user } = await sessionUser();
  if (!user) return { verified: false, error: SESSION_EXPIRED };

  // 이메일이 요청한 이메일과 일치하는지 확인 (보안상 권장)
  if (user.email !== email) return { verified: false, error: '잘못된 인증 요청입니다.' };

  try {
    await prisma.user.updateMany({
      where: { id: user.id, consentAt: null },
      data: { consentAt: new Date(), ...(marketing ? { marketingConsentAt: new Date() } : {}) },
    });
    if (marketing) await addMarketingConsent({ email, userId: user.id, source: 'signup' });
    return { verified: true };
  } catch (e) {
    return { verified: false, error: '동의 기록 중 오류가 발생했습니다.' };
  }
}

/** 3단계 — 비밀번호(이메일 가입만)·닉네임·생년월일·성별 저장 */
export async function saveSignupAccount(_prev: AccountStepState, formData: FormData): Promise<AccountStepState> {
  const { supabase, user } = await sessionUser();
  if (!user) return { errors: { form: [SESSION_EXPIRED] } };

  const parsed = accountSchema.safeParse({
    nickname: formData.get('nickname'),
    birthdate: formData.get('birthdate'),
    gender: formData.get('gender'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  // 소셜 가입 세션(app_metadata.provider !== 'email')은 비밀번호를 받지 않는다
  const requiresPassword = user.app_metadata.provider === 'email';
  if (requiresPassword) {
    const password = PASSWORD_RULES.safeParse(formData.get('password'));
    if (!password.success) {
      return { errors: { password: [password.error.issues[0].message] } };
    }
    if (password.data !== formData.get('passwordConfirm')) {
      return { errors: { passwordConfirm: ['비밀번호가 일치하지 않습니다.'] } };
    }
    const { error } = await supabase.auth.updateUser({ password: password.data });
    if (error) {
      return { errors: { password: [mapAuthError(error)] } };
    }
  }

  const { nickname, birthdate, gender } = parsed.data;
  // 개인정보(생년월일·성별)는 암호화하여 저장. 이름은 표시·조회에 쓰이므로 평문 유지.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: nickname,
      birthdate: await encryptSecret(birthdate),
      gender: await encryptSecret(gender),
    },
  });

  return { saved: true };
}

/** 4단계 — 포지션·전공(선택)·관심태그·유입경로 저장, 가입 완료 처리 */
export async function saveSignupProfile(_prev: ProfileStepState, formData: FormData): Promise<ProfileStepState> {
  const { user } = await sessionUser();
  if (!user) return { errors: { form: [SESSION_EXPIRED] } };

  const parsed = profileSchema.safeParse({
    position: formData.get('position'),
    major: String(formData.get('major') ?? ''),
    interests: formData.getAll('interests').map(String),
    referral: formData.get('referral'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { position, major, interests, referral } = parsed.data;
  // 개인정보(포지션·전공·유입경로)는 암호화 저장. interests(관심 태그)는 비민감이라 평문 유지.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      position: await encryptSecret(position),
      major: await encryptSecret(major || null),
      interests,
      referralSource: await encryptSecret(referral),
      profileCompleted: true,
    },
    select: { name: true },
  });

  await prisma.workbook.upsert({
    where: { userId_name: { userId: user.id, name: '기본 문제집' } },
    create: { userId: user.id, name: '기본 문제집', isDefault: true },
    update: {},
  });

  return { saved: true, nickname: updated.name };
}

/** 소셜 가입 — 동의 상태를 쿠키에 보존한 뒤 OAuth로 넘어간다. 콜백이 쿠키를 읽어 동의를 기록한다. */
export async function signupWithOAuth(marketing: boolean, provider: OAuthProvider): Promise<void> {
  await assertEnabled('flag.signup', '현재 신규 가입을 받지 않고 있습니다.');

  const supabase = await createClient();
  const h = await headers();
  const site = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;

  const cookieStore = await cookies();
  cookieStore.set(SIGNUP_CONSENT_COOKIE, marketing ? 'marketing' : 'required', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  // 네이버는 커스텀 OAuth2 라우트로 위임 (동의 쿠키는 위에서 이미 설정됨)
  if (provider === 'naver') redirect('/api/auth/naver/start');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Parameters<typeof supabase.auth.signInWithOAuth>[0]['provider'],
    options: { redirectTo: `${site}/auth/callback` },
  });

  if (error || !data.url) {
    redirect(
      `/signup?oauthError=${encodeURIComponent(error ? mapAuthError(error) : '소셜 가입을 시작할 수 없습니다.')}`,
    );
  }

  redirect(data.url);
}
