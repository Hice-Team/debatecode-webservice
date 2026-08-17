import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { deleteCourse, deleteLesson } from '@/app/lib/actions/study-admin';
import CourseForm from './course-form';

export const metadata: Metadata = { title: '학습자료 에디터' };

export default async function StudyAdminPage({ searchParams }: PageProps<'/dashboard/study'>) {
  const user = await getUser();
  if (user.role !== 'admin') redirect('/dashboard');
  const { error } = await searchParams;

  const courses = await prisma.course.findMany({
    orderBy: { order: 'asc' },
    include: {
      lessons: { orderBy: { order: 'asc' }, select: { id: true, title: true, slug: true, order: true, _count: { select: { progress: true } } } },
    },
  });

  return (
    <PageShell width="4xl">
      <BackButton label="관리자 대시보드로" className="mb-4" />
      <PageHeader
        slug="study-editor"
        title="학습자료 에디터"
        desc="debateStudy 코스와 강의(docs)를 작성·수정·삭제합니다."
        className="mt-4 mb-6"
      />

      {typeof error === 'string' && (
        <p className="mb-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>
      )}

      <div className="mb-8">
        <CourseForm />
      </div>

      <div className="space-y-6">
        {courses.map((course) => (
          <section key={course.id} className="bg-white rounded-xl border border-ink/10 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-ink/5 px-5 py-4">
              <div className="min-w-0">
                <h3 className="font-bold truncate">{course.title}</h3>
                <p className="font-mono text-[11px] text-ink-soft/40">
                  /study/{course.slug} · {course.language} · 강의 {course.lessons.length}개
                </p>
              </div>
              <Link
                href={`/dashboard/study/lesson/new?courseId=${course.id}`}
                className="ml-auto shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                + 강의 추가
              </Link>
              <form action={deleteCourse} className="shrink-0">
                <input type="hidden" name="courseId" value={course.id} />
                <button
                  type="submit"
                  className="font-mono text-[11px] text-rose-500/70 hover:text-rose-600 underline underline-offset-2"
                >
                  코스 삭제
                </button>
              </form>
            </div>
            <div className="divide-y divide-ink/5">
              {course.lessons.map((lesson) => (
                <div key={lesson.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="font-mono text-[11px] text-ink-soft/30 w-6 shrink-0">{lesson.order}</span>
                  <span className="font-medium truncate">{lesson.title}</span>
                  <span className="font-mono text-[11px] text-ink-soft/40 truncate hidden sm:inline">{lesson.slug}</span>
                  <span className="ml-auto font-mono text-[11px] text-ink-soft/40 shrink-0">
                    수강 {lesson._count.progress}
                  </span>
                  <Link
                    href={`/dashboard/study/lesson/${lesson.id}`}
                    className="shrink-0 font-mono text-[11px] text-ink-soft/60 hover:text-signal underline underline-offset-2"
                  >
                    수정
                  </Link>
                  <form action={deleteLesson} className="shrink-0">
                    <input type="hidden" name="lessonId" value={lesson.id} />
                    <button
                      type="submit"
                      className="font-mono text-[11px] text-rose-500/70 hover:text-rose-600 underline underline-offset-2"
                    >
                      삭제
                    </button>
                  </form>
                </div>
              ))}
              {course.lessons.length === 0 && (
                <p className="px-5 py-4 text-sm text-ink-soft/40">아직 강의가 없습니다.</p>
              )}
            </div>
          </section>
        ))}
        {courses.length === 0 && (
          <p className="rounded-xl border border-ink/10 bg-white px-6 py-16 text-center text-sm text-ink-soft/40">
            코스가 없습니다. 위에서 첫 코스를 추가해 보세요.
          </p>
        )}
      </div>
    </PageShell>
  );
}
