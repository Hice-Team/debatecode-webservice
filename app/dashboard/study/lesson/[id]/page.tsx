import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageShell } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import LessonForm from '../../lesson-form';

export const metadata: Metadata = { title: '강의 작성' };

// id='new'(+?courseId=) → 생성, 숫자 → 해당 강의 수정
export default async function LessonEditorPage({ params, searchParams }: PageProps<'/dashboard/study/lesson/[id]'>) {
  const user = await getUser();
  if (user.role !== 'admin') redirect('/dashboard');

  const { id } = await params;
  const { courseId: courseIdParam } = await searchParams;

  if (id === 'new') {
    const courseId = Number(courseIdParam);
    if (!Number.isInteger(courseId)) redirect('/dashboard/study');
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true } });
    if (!course) notFound();

    return (
      <PageShell width="3xl">
        <BackButton label="학습자료 에디터로" className="mb-6" />
        <div className="dc-card p-8">
          <LessonForm courseId={course.id} courseTitle={course.title} />
        </div>
      </PageShell>
    );
  }

  const lessonId = Number(id);
  if (!Number.isInteger(lessonId)) notFound();
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { course: { select: { id: true, title: true } } },
  });
  if (!lesson) notFound();

  return (
    <PageShell width="3xl">
      <BackButton label="학습자료 에디터로" className="mb-6" />
      <div className="dc-card p-8">
        <LessonForm
          courseId={lesson.course.id}
          courseTitle={lesson.course.title}
          initial={{ id: lesson.id, title: lesson.title, slug: lesson.slug, content: lesson.content, order: lesson.order }}
        />
      </div>
    </PageShell>
  );
}
