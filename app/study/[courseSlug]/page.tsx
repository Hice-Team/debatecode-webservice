import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/app/components/page-shell';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';

export default async function CoursePage({ params }: PageProps<'/study/[courseSlug]'>) {
  const { courseSlug } = await params;
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
          progress: session ? { where: { userId: session.userId }, select: { id: true } } : undefined,
        },
      },
    },
  });
  if (!course) notFound();

  return (
    <PageShell width="3xl">
        <Link href="/study" className="font-mono text-xs text-brand-600 hover:underline">
          ← 학습
        </Link>
        <div className="mt-4 mb-8">
          <span className="font-mono text-xs px-2 py-1 rounded border border-ink/15 bg-white text-ink-soft/60 uppercase">
            {course.language}
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {course.title}
          </h1>
          <p className="mt-2 text-ink-soft/60">{course.description}</p>
          {session && course.lessons.length > 0 && (() => {
            const done = course.lessons.filter((l) => (l.progress?.length ?? 0) > 0).length;
            const pct = Math.round((done / course.lessons.length) * 100);
            return (
              <div className="mt-5">
                <div className="flex items-center justify-between font-mono text-[11px] text-ink-soft/40 mb-1.5">
                  <span>{done}/{course.lessons.length}강 완료</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink/5">
                  <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })()}
        </div>

        {/* 레슨 경로 — 세로 연결선으로 이어지는 학습 순서. 첫 미완료 레슨이 현재 위치다. */}
        <div className="relative bg-white rounded-2xl border border-ink/10 px-6 py-5">
          <div aria-hidden className="absolute left-[43px] top-8 bottom-8 w-px bg-ink/10" />
          {(() => {
            const currentIdx = course.lessons.findIndex((l) => (l.progress?.length ?? 0) === 0);
            return course.lessons.map((l, i) => {
              const completed = (l.progress?.length ?? 0) > 0;
              const current = i === currentIdx;
              return (
                <Link
                  key={l.slug}
                  href={`/study/${course.slug}/${l.slug}`}
                  className="group relative flex items-center gap-4 rounded-xl px-2 py-3 hover:bg-paper/60 transition-colors"
                >
                  <span
                    className={`z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-mono transition ${
                      completed
                        ? 'bg-emerald-500 text-white'
                        : current
                          ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                          : 'border border-ink/15 bg-white text-ink-soft/50'
                    }`}
                  >
                    {completed ? '✓' : i + 1}
                  </span>
                  <span className={`font-semibold ${!completed && !current ? 'text-ink-soft/60' : ''}`}>{l.title}</span>
                  {current ? (
                    <span className="ml-auto shrink-0 rounded-full bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition group-hover:bg-brand-500">
                      {i === 0 && currentIdx === 0 ? '시작하기' : '이어서 학습'}
                    </span>
                  ) : (
                    <span className="ml-auto font-mono text-xs text-brand-600 opacity-0 transition group-hover:opacity-100">
                      {completed ? '다시 보기' : '학습하기'} →
                    </span>
                  )}
                </Link>
              );
            });
          })()}
        </div>
    </PageShell>
  );
}
