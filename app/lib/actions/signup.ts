'use server';

// 다단계 가입 위저드 서버 액션.
//
// 흐름: 약관 동의 → 계정 정보 → 프로필 → 완료.
//
// 두 가지가 예전과 다르다.
//
//  1) **이메일 인증 단계가 없다.** 예전에는 Supabase의 매직코드로 먼저 세션을 만들고 그 위에
//     정보를 얹었다. 코드가 오지 않으면 가입 자체가 막혔고, 그 실패는 우리 로그에 남지도 않았다.
//     지금은 이메일을 형식만 확인하고 받는다.
//
//  2) **마지막 단계를 마쳐야 계정이 생긴다.** 그전까지 입력값은 SignupDraft에만 있고
//     (app/lib/signup-draft.ts), 중간에 이탈하면 12시간 안에 돌아와 이어서 할 수 있다.
//     예전처럼 반쪽짜리 계정이 남지 않는다.
//
// 소셜 가입은 OAuth 특성상 세션이 먼저 생긴다. 그래도 프로필 값은 똑같이 초안에만 모아 두고,
// 마지막 단계에서 한 번에 User에 쓴다.
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { createAdminClient } from '../supabase/admin';
import { prisma } from '../prisma';
import { assertEnabled, featureBlockMessage } from '../settings';
import { addMarketingConsent } from '../marketing';
import { rateLimit, clientIp } from '../rate-limit';
import { mapAuthError } from '../auth-errors';
import { encryptSecret, decryptSecret } from '../crypto';
import { saveDraft, adoptDraftByEmail, discardDraft, loadDraft } from '../signup-draft';
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
    email?: string[];
    nickname?: string[];
    password?: string[];
    passwordConfirm?: string[];
    birthdate?: string[];
    gender?: string[];
    form?: string[];
  };
  saved?: boolean;
  /** 같은 IP의 초안을 이메일로 넘겨받았을 때 — 화면에 "이어서 진행합니다"를 띄운다 */
  resumed?: boolean;
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
    const age = (new Date().getTime() - Date.parse(v)) / (365.25 * 24 * 3600 * 1000);
    return age >= 14;
  }, '만 14세 이상만 가입할 수 있습니다.')
  .refine((v) => {
    const age = (new Date().getTime() - Date.parse(v)) / (365.25 * 24 * 3600 * 1000);
    return age <= 120;
  }, '올바른 생년월일을 입력해 주세요.');

const accountSchema = z.object({
  nickname: z.string().trim().min(2, '닉네임은 2자 이상이어야 합니다.').max(20, '닉네임은 20자 이하여야 합니다.'),
  birthdate: birthdateSchema,
  gender: z.string().refine((v) => GENDER_VALUES.includes(v as (typeof GENDER_VALUES)[number]), '성별을 선택해 주세요.'),
});

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('올바른 이메일 형식이 아닙니다.'));

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

/** 위저드 액션 공통 — 현재 세션 사용자를 확인한다 (없으면 null) */
async function sessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const DRAFT_EXPIRED = '가입 진행 정보가 만료되었습니다. 처음부터 다시 시작해 주세요.';

/* ---------- 1단계: 약관 동의 ---------- */

/**
 * 동의를 초안에 기록한다.
 *
 * 가입 킬 스위치를 여기서 본다 — 첫 단계에서 막아야 뒤 단계를 다 채운 뒤 거절당하는 일이 없다.
 */
export async function recordSignupConsent(_prev: ConsentState, formData: FormData): Promise<ConsentState> {
  const blocked = await featureBlockMessage('flag.signup', '현재 신규 가입을 받지 않고 있습니다.');
  if (blocked) return { errors: { form: [blocked] } };

  const marketing = formData.get('marketing') === 'on';
  const { user } = await sessionUser();

  await saveDraft({
    marketing,
    consentedAt: new Date(),
    step: 'account',
    userId: user?.id ?? null,
    // 소셜 가입은 이메일이 이미 정해져 있다 — 계정 단계에서 다시 묻지 않는다
    email: user?.email?.toLowerCase() ?? undefined,
  });

  return { recorded: true };
}

/* ---------- 2단계: 계정 정보 ---------- */

/**
 * 이메일·비밀번호·닉네임·생년월일·성별을 초안에 담는다. **계정은 아직 만들지 않는다.**
 *
 * 비밀번호는 마지막 단계에서 Supabase로 넘겨야 해서 보관할 수밖에 없다. 평문 대신
 * AES-256-GCM으로 암호화해 두고, 가입이 끝나면 초안 행을 즉시 지운다.
 */
export async function saveSignupAccount(_prev: AccountStepState, formData: FormData): Promise<AccountStepState> {
  const blocked = await featureBlockMessage('flag.signup', '현재 신규 가입을 받지 않고 있습니다.');
  if (blocked) return { errors: { form: [blocked] } };

  const { user } = await sessionUser();
  const isSocial = Boolean(user);

  const parsed = accountSchema.safeParse({
    nickname: formData.get('nickname'),
    birthdate: formData.get('birthdate'),
    gender: formData.get('gender'),
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  let email = user?.email?.toLowerCase() ?? '';
  let resumed = false;

  if (!isSocial) {
    const parsedEmail = emailSchema.safeParse(formData.get('email'));
    if (!parsedEmail.success) return { errors: { email: [parsedEmail.error.issues[0].message] } };
    email = parsedEmail.data;

    // 무차별 가입 시도를 IP 단위로 막는다 (인증 코드가 없어진 만큼 여기가 유일한 방벽이다)
    const ip = await clientIp();
    if (!rateLimit(`signup:${ip}`, 10, 10 * 60_000)) {
      return { errors: { form: ['가입 시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.'] } };
    }

    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      return { errors: { email: ['이미 가입된 이메일입니다. 로그인해 주세요.'] } };
    }

    // 쿠키를 잃고 돌아온 본인이면 여기서 초안을 넘겨받는다 (app/lib/signup-draft.ts 참고)
    const { draft } = await loadDraft();
    if (!draft) resumed = Boolean(await adoptDraftByEmail(email));
  }

  const patch: Parameters<typeof saveDraft>[0] = {
    email,
    nickname: parsed.data.nickname,
    birthdateEnc: await encryptSecret(parsed.data.birthdate),
    genderEnc: await encryptSecret(parsed.data.gender),
    step: 'profile',
    userId: user?.id ?? null,
  };

  if (!isSocial) {
    const password = PASSWORD_RULES.safeParse(formData.get('password'));
    if (!password.success) return { errors: { password: [password.error.issues[0].message] } };
    if (password.data !== formData.get('passwordConfirm')) {
      return { errors: { passwordConfirm: ['비밀번호가 일치하지 않습니다.'] } };
    }
    patch.passwordEnc = await encryptSecret(password.data);
  }

  await saveDraft(patch);
  return { saved: true, resumed };
}

/* ---------- 3단계: 프로필 + 계정 생성 ---------- */

/**
 * 프로필을 받고 **여기서 비로소 계정을 만든다.**
 *
 * 이메일 가입: Supabase에 사용자를 만들고(이메일 확인은 우리가 하지 않으므로 확인 완료로 표시),
 * 곧바로 비밀번호 로그인으로 세션 쿠키를 심는다. 소셜 가입: 세션이 이미 있으므로 저장만 한다.
 *
 * User 행은 auth 트리거가 만들지만, 트리거가 없거나 늦는 환경에서도 깨지지 않도록 upsert로 쓴다.
 */
export async function saveSignupProfile(_prev: ProfileStepState, formData: FormData): Promise<ProfileStepState> {
  const blocked = await featureBlockMessage('flag.signup', '현재 신규 가입을 받지 않고 있습니다.');
  if (blocked) return { errors: { form: [blocked] } };

  const parsed = profileSchema.safeParse({
    position: formData.get('position'),
    major: String(formData.get('major') ?? ''),
    interests: formData.getAll('interests').map(String),
    referral: formData.get('referral'),
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const { draft } = await loadDraft();
  if (!draft || !draft.email || !draft.nickname) return { errors: { form: [DRAFT_EXPIRED] } };

  const { position, major, interests, referral } = parsed.data;
  const { supabase, user: sessionUserRow } = await sessionUser();

  let userId = sessionUserRow?.id ?? draft.userId ?? null;

  // ── 이메일 가입: 지금 계정을 만든다 ──
  if (!userId) {
    const password = await decryptSecret(draft.passwordEnc);
    if (!password) return { errors: { form: [DRAFT_EXPIRED] } };

    // 마지막 순간에 같은 이메일이 선점되는 경우(동시 가입)를 여기서 한 번 더 본다
    if (await prisma.user.findUnique({ where: { email: draft.email }, select: { id: true } })) {
      return { errors: { form: ['이미 가입된 이메일입니다. 로그인해 주세요.'] } };
    }

    const admin = createAdminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: draft.email,
      password,
      // 인증 코드 단계를 없앴으므로 확인 메일을 기다리게 두면 로그인이 영영 막힌다
      email_confirm: true,
      user_metadata: { name: draft.nickname },
    });
    if (createError || !created.user) {
      return { errors: { form: [createError ? mapAuthError(createError) : '계정을 만들지 못했습니다.'] } };
    }
    userId = created.user.id;

    // 세션 쿠키를 심는다 — 이게 없으면 가입 직후 로그인 화면으로 튕긴다
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: draft.email, password });
    if (signInError) return { errors: { form: [mapAuthError(signInError)] } };
  }

  // 동의 시각은 법적 의미가 있는 기록이다 — 이미 찍혀 있으면 덮어쓰지 않는다
  // (소셜 가입은 OAuth 콜백이 먼저 기록한다)
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { consentAt: true } });

  const profileData = {
    name: draft.nickname,
    birthdate: draft.birthdateEnc,
    gender: draft.genderEnc,
    position: await encryptSecret(position),
    major: await encryptSecret(major || null),
    interests: interests as never,
    referralSource: await encryptSecret(referral),
    consentAt: existing?.consentAt ?? draft.consentedAt ?? new Date(),
    ...(draft.marketing ? { marketingConsentAt: new Date() } : {}),
    profileCompleted: true,
  };

  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: draft.email, ...profileData },
    update: profileData,
  });

  await prisma.workbook.upsert({
    where: { userId_name: { userId, name: '기본 문제집' } },
    create: { userId, name: '기본 문제집', isDefault: true },
    update: {},
  });

  if (draft.marketing) {
    await addMarketingConsent({ email: draft.email, userId, source: 'signup' });
  }

  // 비밀번호가 담긴 행이다 — 완료 즉시 지운다
  await discardDraft(draft.id);

  return { saved: true, nickname: draft.nickname };
}

/* ---------- 소셜 가입 ---------- */

/** 동의 상태를 쿠키에 보존한 뒤 OAuth로 넘어간다. 콜백이 쿠키를 읽어 동의를 기록한다. */
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
