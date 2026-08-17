import { notFound } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';
import LessonPlayer from './lesson-player';

export default async function LessonPage({ params }: PageProps<'/study/[courseSlug]/[lessonSlug]'>) {
  const { courseSlug, lessonSlug } = await params;
  const session = await getSessionOptional();

  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    include: {
      lessons: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          slug: true,
          title: true,
          content: true,
          progress: session ? { where: { userId: session.userId }, select: { id: true } } : undefined,
        },
      },
    },
  });
  if (!course) notFound();

  const idx = course.lessons.findIndex((l) => l.slug === lessonSlug);
  const lesson = course.lessons[idx];
  if (!lesson) notFound();

  return (
    <LessonPlayer
      courseSlug={course.slug}
      courseTitle={course.title}
      lessonId={lesson.id}
      lessonTitle={lesson.title}
      content={lesson.content}
      lessonIndex={idx}
      lessons={course.lessons.map((l) => ({
        slug: l.slug,
        title: l.title,
        completed: (l.progress?.length ?? 0) > 0,
      }))}
      completed={(lesson.progress?.length ?? 0) > 0}
      loggedIn={!!session}
    />
  );
}
