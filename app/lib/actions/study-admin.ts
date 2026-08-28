'use server';

// debateStudy 학습자료 에디터 액션 — 관리자 전용 코스/강의 CRUD.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../prisma';
import { getUser } from '../dal';
import { requirePermission } from '../permissions-server';

export interface CourseFormState {
  errors?: { title?: string[]; slug?: string[]; description?: string[]; form?: string[] };
  saved?: boolean;
}

export interface LessonFormState {
  errors?: { title?: string[]; slug?: string[]; content?: string[]; form?: string[] };
}

async function requireAdmin(): Promise<string | null> {
  const user = await getUser();
  if (user.role !== 'admin') return '관리자만 수행할 수 있습니다.';
  try {
    await requirePermission(user, 'problem.manage');
  } catch (error) {
    return error instanceof Error ? error.message : '권한이 없습니다.';
  }
  return null;
}
//
// 역할 검사만으로는 부족하다. PermissionGrant의 **개별 차단(deny)** 이 통하지 않기 때문이다.
// 문제가 된 담당자의 권한 하나만 잠그려 해도, 역할만 보는 자리는 그대로 열려 있다 —
// 하필 돈과 발송이 걸린 쪽이 그랬다. requirePermission이 역할 기본값과 오버라이드를
// 함께 판정한다(app/lib/permissions-server.ts).

const SLUG = z
  .string()
  .trim()
  .min(1, 'slug를 입력해 주세요.')
  .max(60)
  .regex(/^[a-z0-9-]+$/, 'slug는 영문 소문자·숫자·하이픈만 사용할 수 있습니다.');

const courseSchema = z.object({
  title: z.string().trim().min(2, '제목은 2자 이상이어야 합니다.').max(60),
  slug: SLUG,
  description: z.string().trim().min(5, '설명은 5자 이상이어야 합니다.').max(300),
  language: z.string().trim().min(1).max(20),
  order: z.coerce.number().int().min(0).default(0),
});

const lessonSchema = z.object({
  courseId: z.coerce.number().int(),
  title: z.string().trim().min(2, '제목은 2자 이상이어야 합니다.').max(80),
  slug: SLUG,
  content: z.string().trim().min(20, '강의 내용은 20자 이상이어야 합니다.').max(50_000),
  order: z.coerce.number().int().min(0).default(0),
});

export async function createCourse(_prev: CourseFormState, formData: FormData): Promise<CourseFormState> {
  const denied = await requireAdmin();
  if (denied) return { errors: { form: [denied] } };

  const parsed = courseSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug'),
    description: formData.get('description'),
    language: formData.get('language') || 'python',
    order: formData.get('order') || 0,
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const exists = await prisma.course.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
  if (exists) return { errors: { slug: ['이미 사용 중인 slug입니다.'] } };

  await prisma.course.create({ data: parsed.data });
  revalidatePath('/dashboard/study');
  revalidatePath('/study');
  return { saved: true };
}

// 코스 삭제 — 수강 기록 보존을 위해 진행 기록이 있으면 거부
export async function deleteCourse(formData: FormData): Promise<void> {
  if (await requireAdmin()) return;
  const courseId = Number(formData.get('courseId'));
  if (!Number.isInteger(courseId)) return;

  const progressCount = await prisma.lessonProgress.count({ where: { lesson: { courseId } } });
  if (progressCount > 0) {
    redirect(`/dashboard/study?error=${encodeURIComponent('수강 기록이 있는 코스는 삭제할 수 없습니다.')}`);
  }

  await prisma.$transaction([
    prisma.lesson.deleteMany({ where: { courseId } }),
    prisma.course.delete({ where: { id: courseId } }),
  ]);
  revalidatePath('/dashboard/study');
  revalidatePath('/study');
}

export async function saveLesson(_prev: LessonFormState, formData: FormData): Promise<LessonFormState> {
  const denied = await requireAdmin();
  if (denied) return { errors: { form: [denied] } };

  const lessonId = formData.get('lessonId') ? Number(formData.get('lessonId')) : null;
  const parsed = lessonSchema.safeParse({
    courseId: formData.get('courseId'),
    title: formData.get('title'),
    slug: formData.get('slug'),
    content: formData.get('content'),
    order: formData.get('order') || 0,
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  const d = parsed.data;

  const course = await prisma.course.findUnique({ where: { id: d.courseId }, select: { slug: true } });
  if (!course) return { errors: { form: ['코스를 찾을 수 없습니다.'] } };

  const conflict = await prisma.lesson.findFirst({
    where: { courseId: d.courseId, slug: d.slug, ...(lessonId ? { NOT: { id: lessonId } } : {}) },
    select: { id: true },
  });
  if (conflict) return { errors: { slug: ['이 코스에 이미 같은 slug의 강의가 있습니다.'] } };

  if (lessonId) {
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { title: d.title, slug: d.slug, content: d.content, order: d.order },
    });
  } else {
    await prisma.lesson.create({ data: d });
  }

  revalidatePath('/dashboard/study');
  revalidatePath('/study');
  revalidatePath(`/study/${course.slug}`);
  redirect('/dashboard/study');
}

// 강의 삭제 — 진행 기록도 함께 삭제
export async function deleteLesson(formData: FormData): Promise<void> {
  if (await requireAdmin()) return;
  const lessonId = Number(formData.get('lessonId'));
  if (!Number.isInteger(lessonId)) return;

  await prisma.$transaction([
    prisma.lessonProgress.deleteMany({ where: { lessonId } }),
    prisma.lesson.delete({ where: { id: lessonId } }),
  ]);
  revalidatePath('/dashboard/study');
  revalidatePath('/study');
}
