'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '../prisma';
import { verifySession } from '../dal';

export async function markLessonComplete(formData: FormData) {
  const { userId } = await verifySession();
  const lessonId = Number(formData.get('lessonId'));
  const courseSlug = formData.get('courseSlug');
  if (!lessonId) return;

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: {},
    create: { userId, lessonId },
  });

  if (typeof courseSlug === 'string') revalidatePath(`/study/${courseSlug}`);
}
