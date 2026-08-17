'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isDebateAiModelId } from '../ai/debateai-models';
import { prisma } from '../prisma';
import { verifySession } from '../dal';
import { createClient } from '../supabase/server';
import { safeStorageKey } from '../storage';

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
  // 면접·리팩토링 모드에서 쓸 debateAI 모델 — 빈 값이면 기본값(Coder-V2)을 쓴다
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

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      emailNotifications: parsed.data.emailNotifications === 'on',
      preferredLanguage: parsed.data.preferredLanguage || null,
      // 카탈로그에 없는 값은 저장하지 않는다 — 폼을 우회한 입력 방지
      aiCodeModel: isDebateAiModelId(parsed.data.aiCodeModel) ? parsed.data.aiCodeModel : null,
    },
  });

  return { saved: true };
}
