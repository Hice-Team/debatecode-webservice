'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isDebateAiModelId } from '../ai/debateai-models';
import { prisma } from '../prisma';
import { verifySession } from '../dal';
import { createClient } from '../supabase/server';
import { safeStorageKey } from '../storage';
import {
  EDITOR_FONTS,
  EDITOR_FONT_SIZES,
  EDITOR_TAB_SIZES,
  MAX_GOAL_LENGTH,
  NOTIFY_CHANNELS,
  TIMEZONES,
  COUNTRIES,
  isChatLanguage,
  isDateFormat,
  isProfileVisibility,
} from '../user-prefs';

export interface ProfileFormState {
  errors?: { name?: string[]; form?: string[] };
  saved?: boolean;
}

export async function updateRankBadgeVisible(visible: boolean) {
  const session = await verifySession();
  await prisma.user.update({ where: { id: session.userId }, data: { rankBadgeVisible: visible } });
}

/**
 * debateAI 학습 활용 동의 토글 — 선택 동의이므로 거부해도 기능 제한이 없다.
 * 동의 시각을 남겨 두어 언제 동의했는지 확인할 수 있게 한다(철회 시 null).
 */
export async function updateAiTrainingConsent(agreed: boolean) {
  const session = await verifySession();
  await prisma.user.update({
    where: { id: session.userId },
    data: { aiTrainingConsentAt: agreed ? new Date() : null },
  });
  revalidatePath('/settings');
}

export interface AppSettingsFormState {
  errors?: { form?: string[] };
  saved?: boolean;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

const profileSchema = z.object({
  name: z.string().min(2, '이름은 2자 이상이어야 합니다.').max(20, '이름은 20자 이하여야 합니다.'),
});

export async function updateProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const session = await verifySession();

  const parsed = profileSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  let avatarUrl: string | undefined;
  const avatar = formData.get('avatar');
  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > MAX_AVATAR_BYTES) {
      return { errors: { form: ['아바타 이미지 용량은 5MB 이하여야 합니다.'] } };
    }
    if (!avatar.type.startsWith('image/')) {
      return { errors: { form: ['아바타는 이미지 파일만 업로드할 수 있습니다.'] } };
    }
    const supabase = await createClient();
    // 키에는 원본 파일명을 넣지 않는다(한글/공백 → Invalid key)
    const path = safeStorageKey(session.userId, avatar.name);
    const { error } = await supabase.storage.from('avatars').upload(path, avatar, {
      contentType: avatar.type || undefined,
      upsert: true,
    });
    if (error) {
      return { errors: { form: [`아바타 업로드에 실패했습니다: ${error.message}`] } };
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    avatarUrl = data.publicUrl;
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { name: parsed.data.name, ...(avatarUrl ? { avatarUrl } : {}) },
  });

  return { saved: true };
}

const appSettingsSchema = z.object({
  emailNotifications: z.string().optional(),
  preferredLanguage: z.string().max(30).optional().or(z.literal('')),
  // 면접·리팩토링 모드에서 쓸 debateAI 모델 — 빈 값이면 기본값을 쓴다
  aiCodeModel: z.string().max(60).optional().or(z.literal('')),
});

export async function updateAppSettings(_prev: AppSettingsFormState, formData: FormData): Promise<AppSettingsFormState> {
  const session = await verifySession();

  const parsed = appSettingsSchema.safeParse({
    emailNotifications: formData.get('emailNotifications') ?? undefined,
    preferredLanguage: formData.get('preferredLanguage') ?? '',
    aiCodeModel: formData.get('aiCodeModel') ?? '',
  });
  if (!parsed.success) {
    return { errors: { form: parsed.error.issues.map((i) => i.message) } };
  }

  // 폼에서 올라온 값은 전부 "카탈로그에 있는가"로 거른다.
  // 셀렉트 박스라고 해서 그 값만 온다는 보장은 없다 — 폼은 우회할 수 있다.
  const timezone = String(formData.get('timezone') ?? '');
  const dateFormat = String(formData.get('dateFormat') ?? '');
  const country = String(formData.get('country') ?? '');

  const editorPrefs = {
    fontSize: pickNumber(formData.get('editorFontSize'), EDITOR_FONT_SIZES, 14),
    tabSize: pickNumber(formData.get('editorTabSize'), [0, ...EDITOR_TAB_SIZES], 0),
    fontFamily: EDITOR_FONTS.some((f) => f.id === formData.get('editorFontFamily'))
      ? String(formData.get('editorFontFamily'))
      : 'plex',
    autocomplete: formData.get('editorAutocomplete') === 'on',
    minimap: formData.get('editorMinimap') === 'on',
    wordWrap: formData.get('editorWordWrap') === 'on',
  };

  // 알림 채널 — 체크되지 않은 상자는 FormData에 아예 오지 않으므로 목록을 돌며 채운다.
  // "온 것만 저장"하면 끈 항목이 저장되지 않고 기본값으로 되살아난다.
  const notifyPrefs: Record<string, boolean> = {};
  for (const ch of NOTIFY_CHANNELS) {
    notifyPrefs[ch.id] = ch.required ? true : formData.get(`notify_${ch.id}`) === 'on';
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      emailNotifications: parsed.data.emailNotifications === 'on',
      preferredLanguage: parsed.data.preferredLanguage || null,
      // 카탈로그에 없는 값은 저장하지 않는다 — 폼을 우회한 입력 방지
      aiCodeModel: isDebateAiModelId(parsed.data.aiCodeModel) ? parsed.data.aiCodeModel : null,
      timezone: TIMEZONES.some((t) => t.id === timezone) ? timezone : null,
      dateFormat: isDateFormat(dateFormat) ? dateFormat : null,
      country: COUNTRIES.some((c) => c.id === country) ? country : null,
      editorPrefs,
      notifyPrefs,
    },
  });

  revalidatePath('/settings');
  return { saved: true };
}

/** 목록에 있는 숫자만 통과시킨다 — 없으면 기본값 */
function pickNumber(raw: FormDataEntryValue | null, allowed: readonly number[], fallback: number): number {
  const n = Number(raw);
  return allowed.includes(n) ? n : fallback;
}

export interface PersonalFormState {
  errors?: { form?: string[]; goal?: string[] };
  saved?: boolean;
}

/**
 * 개인 맞춤 — 학습 목표, 프로필 공개 범위, AI가 답할 언어.
 *
 * 이름·아바타(updateProfile)와 나누어 둔다. 이름과 사진은 "남에게 보이는 나"이고
 * 여기 값들은 "서비스가 나를 어떻게 대할지"다. 한 폼에 묶으면 목표를 고치려다
 * 아바타를 다시 올리게 된다.
 */
export async function updatePersonalSettings(
  _prev: PersonalFormState,
  formData: FormData,
): Promise<PersonalFormState> {
  const session = await verifySession();

  const goal = String(formData.get('profileGoal') ?? '').trim();
  if (goal.length > MAX_GOAL_LENGTH) {
    return { errors: { goal: [`목표는 ${MAX_GOAL_LENGTH}자 이하로 적어 주세요.`] } };
  }

  const visibility = String(formData.get('profileVisibility') ?? '');
  const chatLanguage = String(formData.get('chatLanguage') ?? '');

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      profileGoal: goal || null,
      ...(isProfileVisibility(visibility) ? { profileVisibility: visibility } : {}),
      chatLanguage: isChatLanguage(chatLanguage) && chatLanguage !== 'auto' ? chatLanguage : null,
      // 공개 범위를 비공개로 내리면 등급 배지도 함께 감춘다 —
      // "비공개로 했는데 글마다 등급이 보인다"가 되지 않게.
      ...(visibility === 'private' ? { rankBadgeVisible: false } : {}),
    },
  });

  revalidatePath('/settings');
  return { saved: true };
}

/**
 * 기본 프로필로 되돌리기.
 *
 * 아바타 파일 자체는 지우지 않고 연결만 끊는다. 스토리지에서 지우는 것은 되돌릴 수 없고,
 * 이 버튼은 "기본 모습으로 보이게 해 줘"라는 뜻이지 "파일을 파기해 줘"가 아니다.
 * 파일까지 지우는 길은 회원 탈퇴다.
 */
export async function resetProfileAppearance(): Promise<void> {
  const session = await verifySession();
  await prisma.user.update({
    where: { id: session.userId },
    data: { avatarUrl: null, profileGoal: null },
  });
  revalidatePath('/settings');
}
