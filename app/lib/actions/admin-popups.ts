'use server';

// 공개 팝업(공지) 액션.
//
// 예전 구조에서 바뀐 점 셋:
//   1) 활성 팝업이 1건으로 강제돼 있었다 — 새로 게시하면 기존 것이 자동으로 내려갔다.
//      모집 공고와 점검 안내를 동시에 띄울 수 없어서, 여러 개를 동시에 Live할 수 있게 풀었다.
//   2) 텍스트만 가능했다 — 포스터 이미지를 올릴 수 있게 했다.
//   3) 팝업이 정보 전달로 끝났다 — 클릭하면 커뮤니티 글·외부 링크·문의 메일로 가는 버튼을 붙였다.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { requirePermission } from '../permissions-server';
import { audit } from '../audit';
import { createClient } from '../supabase/server';
import { safeStorageKey } from '../storage';

export const POPUP_LINK_TYPES = ['none', 'post', 'url', 'mail'] as const;
export type PopupLinkType = (typeof POPUP_LINK_TYPES)[number];

export interface PopupFormState {
  errors?: { title?: string[]; content?: string[]; form?: string[] };
  saved?: boolean;
}

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const popupSchema = z
  .object({
    title: z.string().trim().min(2, '제목은 2자 이상이어야 합니다.').max(80),
    content: z.string().trim().max(4000),
    variant: z.enum(['text', 'poster']),
    linkType: z.enum(POPUP_LINK_TYPES),
    linkTarget: z.string().trim().max(500),
    linkLabel: z.string().trim().max(40),
    order: z.number().int().min(0).max(999),
    startsAt: z.string().trim().max(40),
    endsAt: z.string().trim().max(40),
  })
  // 포스터형은 이미지가 본문을 대신하지만, 텍스트형은 내용이 비면 보여줄 게 없다
  .refine((v) => v.variant === 'poster' || v.content.length >= 5, {
    message: '내용은 5자 이상이어야 합니다. (이미지만 띄우려면 포스터형을 고르세요)',
    path: ['content'],
  });

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 이미지 업로드 — 실패하면 null을 돌려주고 나머지 저장은 계속한다. */
async function uploadPoster(file: File | null, userId: string): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('이미지는 PNG·JPEG·WebP·GIF만 올릴 수 있습니다.');
  if (file.size > IMAGE_MAX_BYTES) throw new Error('이미지는 5MB 이하만 올릴 수 있습니다.');

  const supabase = await createClient();
  const path = safeStorageKey(`popups/${userId}`, file.name);
  const { error } = await supabase.storage
    .from('community-uploads')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`이미지 업로드 실패: ${error.message}`);
  return supabase.storage.from('community-uploads').getPublicUrl(path).data.publicUrl;
}

function readForm(formData: FormData) {
  return {
    title: formData.get('title'),
    content: String(formData.get('content') ?? ''),
    variant: String(formData.get('variant') ?? 'text'),
    linkType: String(formData.get('linkType') ?? 'none'),
    linkTarget: String(formData.get('linkTarget') ?? ''),
    linkLabel: String(formData.get('linkLabel') ?? ''),
    order: Number(formData.get('order') ?? 0),
    startsAt: String(formData.get('startsAt') ?? ''),
    endsAt: String(formData.get('endsAt') ?? ''),
  };
}

export async function savePopup(_prev: PopupFormState, formData: FormData): Promise<PopupFormState> {
  const caller = await getUser();
  try {
    await requirePermission(caller, 'announcement.manage');

    const parsed = popupSchema.safeParse(readForm(formData));
    if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

    const id = String(formData.get('id') ?? '');
    const imageFile = formData.get('image');
    const uploaded = await uploadPoster(imageFile instanceof File ? imageFile : null, caller.id);
    const keepImage = String(formData.get('existingImageUrl') ?? '') || null;
    const removeImage = formData.get('removeImage') === 'on';

    const d = parsed.data;
    const data = {
      title: d.title,
      content: d.content,
      variant: d.variant,
      linkType: d.linkType,
      linkTarget: d.linkType === 'none' ? null : d.linkTarget || null,
      linkLabel: d.linkLabel || null,
      order: d.order,
      startsAt: parseDate(d.startsAt),
      endsAt: parseDate(d.endsAt),
      imageUrl: removeImage ? null : (uploaded ?? keepImage),
    };

    if (id) {
      await prisma.announcement.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
      await audit({
        actor: caller,
        action: 'announcement.publish',
        targetType: 'announcement',
        targetId: id,
        summary: `팝업 수정 — ${d.title}`,
      });
    } else {
      // 여기서 기존 활성 팝업을 내리지 않는다 — 여러 개가 동시에 떠 있을 수 있다
      const created = await prisma.announcement.create({ data: { ...data, active: true } });
      await audit({
        actor: caller,
        action: 'announcement.publish',
        targetType: 'announcement',
        targetId: created.id,
        summary: `팝업 게시 — ${d.title}`,
      });
    }

    revalidatePath('/console/popups');
    revalidatePath('/', 'layout');
    return { saved: true };
  } catch (error) {
    return { errors: { form: [error instanceof Error ? error.message : '저장에 실패했습니다.'] } };
  }
}

export async function togglePopup(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'announcement.manage');

  const id = String(formData.get('id') ?? '');
  const target = await prisma.announcement.findUnique({ where: { id }, select: { active: true, title: true } });
  if (!target) return;

  // 올릴 때 다른 팝업을 내리지 않는다 — 동시 노출이 기본 동작이다
  await prisma.announcement.update({ where: { id }, data: { active: !target.active } });
  await audit({
    actor: caller,
    action: 'announcement.publish',
    targetType: 'announcement',
    targetId: id,
    summary: `팝업 ${target.active ? '내림' : '올림'} — ${target.title}`,
  });

  revalidatePath('/console/popups');
  revalidatePath('/', 'layout');
}

export async function deletePopup(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'announcement.manage');

  const id = String(formData.get('id') ?? '');
  const target = await prisma.announcement.findUnique({ where: { id }, select: { title: true } });
  await prisma.announcement.delete({ where: { id } }).catch(() => {});
  if (target) {
    await audit({
      actor: caller,
      action: 'announcement.publish',
      targetType: 'announcement',
      targetId: id,
      summary: `팝업 삭제 — ${target.title}`,
    });
  }

  revalidatePath('/console/popups');
  revalidatePath('/', 'layout');
}
