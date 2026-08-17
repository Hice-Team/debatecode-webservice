import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import I18nSlot from '@/app/components/i18n-slot';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';
import AiSearch from './ai-search';
import ResumePrompt from './resume-prompt';
import { getRecentSession } from '@/app/lib/actions/ai-search';
import { hasModelCatalogAccess } from '@/app/lib/ai/search-answerer';

export const metadata: Metadata = { title: '학습' };

// 문서 사이트맵 — 외부 레퍼런스와 내부 학습 경로를 계층 구조로 정리한다.
const DOCS_SITEMAP: Array<{
  group: string;
  groupKey: string;
  links: Array<{ title: string; titleKey?: string; href: string; desc: string; descKey?: string; external?: boolean }>;
}> = [
  {
    group: '기초 언어',
    groupKey: 'docs-group-basics',
    links: [
      { title: 'Python Docs', href: 'https://docs.python.org/3/', desc: '문법·표준 라이브러리', descKey: 'docs-python-desc', external: true },
      { title: 'MDN JavaScript', href: 'https://developer.mozilla.org/ko/docs/Web/JavaScript', desc: '브라우저 동작·함수형 패턴', descKey: 'docs-js-desc', external: true },
      { title: 'Java Tutorial', href: 'https://docs.oracle.com/javase/tutorial/', desc: '객체지향·컬렉션·예외', descKey: 'docs-java-desc', external: true },
    ],
  },
  {
    group: '시스템 & 네이티브',
    groupKey: 'docs-group-systems',
    links: [
      { title: 'C Reference', href: 'https://en.cppreference.com/w/c', desc: '포인터·메모리', descKey: 'docs-c-desc', external: true },
      { title: 'C++ Reference', href: 'https://en.cppreference.com/w/cpp', desc: 'STL·모던 C++', descKey: 'docs-cpp-desc', external: true },
      { title: 'C# / .NET', href: 'https://learn.microsoft.com/dotnet/csharp/', desc: 'LINQ·비동기', descKey: 'docs-csharp-desc', external: true },
      { title: 'The Rust Book', href: 'https://doc.rust-lang.org/book/', desc: '소유권·안전한 동시성', descKey: 'docs-rust-desc', external: true },
    ],
  },
  {
    group: '웹 & 앱',
    groupKey: 'docs-group-web',
    links: [
      { title: 'TypeScript Docs', href: 'https://www.typescriptlang.org/docs/', desc: '정적 타입·제네릭', descKey: 'docs-ts-desc', external: true },
      { title: 'Dart Guides', href: 'https://dart.dev/guides', desc: 'Flutter용 타입 안전 언어', descKey: 'docs-dart-desc', external: true },
      { title: 'Web 표준 (MDN)', href: 'https://developer.mozilla.org/ko/docs/Web', desc: 'HTML·CSS·HTTP', external: true },
    ],
  },
  {
    group: '디베이트코드 학습 경로',
    groupKey: 'docs-group-debatecode',
    links: [
      { title: '문제집', titleKey: 'nav-problems', href: '/problems', desc: '디베이트모드로 풀이·면접', descKey: 'docs-problems-desc' },
      { title: '코딩테스트', titleKey: 'nav-contests', href: '/contests', desc: '기업 스타일 모의 테스트', descKey: 'docs-contests-desc' },
      { title: 'debateMate', href: '/debate-mate', desc: '파트너 프로그램', descKey: 'docs-debatemate-desc' },
      { title: '커뮤니티', titleKey: 'nav-community', href: '/community', desc: '풀이 공유·질문', descKey: 'docs-community-desc' },
    ],
  },
];

export default async function StudyPage() {
  const session = await getSessionOptional();
  // AI 설정 여부 — "debateAI와 함께 배우기" 버튼 노출 판단 (기본 provider는 mock)
  const aiConfigured = session
    ? ((await prisma.user.findUnique({ where: { id: session.userId }, select: { aiProvider: true } }))?.aiProvider ?? 'mock') !== 'mock'
    : false;
  // 최근 AI Search 세션 — 로그인 상태에서만 조회한다
  const recentSession = session ? await getRecentSession() : null;

  const courses = await prisma.course.findMany({
    orderBy: { order: 'asc' },
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

  // 전체 진도 요약 + "이어서 학습하기" 대상(첫 미완료 레슨)
  const totalLessons = courses.reduce((sum, c) => sum + c.lessons.length, 0);
  const doneLessons = session
    ? courses.reduce((sum, c) => sum + c.lessons.filter((l) => (l.progress?.length ?? 0) > 0).length, 0)
    : 0;
  const overallPct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;

  let nextLesson: { courseSlug: string; lessonSlug: string; title: string } | null = null;
  if (session) {
    outer: for (const c of courses) {
      for (const l of c.lessons) {
        if ((l.progress?.length ?? 0) === 0) {
          nextLesson = { courseSlug: c.slug, lessonSlug: l.slug, title: l.title };
          break outer;
        }
      }
    }
  }

  return (
    <PageShell width="6xl">
        {/* <PageHeader
          slug="courseware"
          title="학습"
          className="mb-10"
          desc="디베이트코드로 문제 풀이 전 문서 사이트맵을 살펴보고, 문제를 풀어보세요. 향후 debateAI와 함께 학습할 수 있는 코스웨어 기능도 준비 중입니다."
        /> */}

        {/* 진도 요약 — 로그인 + 수강신청 코스가 있을 때만 */}
        {/*{session && totalLessons > 0 && courses.length > 0 && (
          <section className="mb-12 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-600">MY PROGRESS</p>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-3xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    {overallPct}%
                  </span>
                  <span className="text-sm text-ink-soft/50">
                    {doneLessons}/{totalLessons} <I18nSlot k="lessons-completed" fallback="강 완료" />
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink/5">
                  <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${overallPct}%` }} />
                </div>
              </div>
              {nextLesson ? (
                <Link
                  href={`/study/${nextLesson.courseSlug}/${nextLesson.lessonSlug}`}
                  className="shrink-0 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-500 active:scale-[0.98] transition"
                >
                  <I18nSlot k="continue-studying" fallback="이어서 학습하기" /> → {nextLesson.title}
                </Link>
              ) : (
                <span className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">
                  🎉 <I18nSlot k="all-lessons-done" fallback="모든 강의 완료!" />
                </span>
              )}
            </div>
          </section>
        )} */}

        {/* DB 코스 카드 */}
        {/* {courses.length > 0 && (
          <section className="mb-14">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-4">COURSES</h2>
            <div className="grid md:grid-cols-2 gap-5">
              {courses.map((c) => {
                const total = c.lessons.length;
                const done = c.lessons.filter((l) => (l.progress?.length ?? 0) > 0).length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <Link
                    key={c.slug}
                    href={`/study/${c.slug}`}
                    className="group bg-white rounded-2xl border border-ink/10 p-6 hover:border-brand-400 hover:-translate-y-0.5 hover:shadow-md transition"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-xs px-2 py-1 rounded border border-ink/15 bg-paper text-ink-soft uppercase">
                        {c.language}
                      </span>
                      <h3 className="text-lg font-bold">{c.title}</h3>
                      <span className="ml-auto font-mono text-[11px] text-ink-soft/40">{total} <I18nSlot k="lesson-unit" fallback="강" /></span>
                    </div>
                    <p className="text-sm text-ink-soft/60 leading-relaxed">{c.description}</p>
                    {session && total > 0 && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between font-mono text-[11px] text-ink-soft/40 mb-1.5">
                          <span>{done}/{total} <I18nSlot k="lessons-completed" fallback="강 완료" /></span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/5">
                          <div className="h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                    <span className="mt-4 inline-block font-mono text-[11px] text-brand-600">
                      {done > 0 ? <I18nSlot k="continue-studying" fallback="이어서 학습하기" /> : <I18nSlot k="start-studying" fallback="학습 시작하기" />} →
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )} */}

        {/* AI Search — 문서 사이트맵 위. 여러 언어/라이브러리 문서를 한 번에 훑는다 */}
        <AiSearch liveModel={hasModelCatalogAccess()} authed={!!session} />

        {/* 재진입 안내 — 대화가 남아 있을 때만 (메시지가 0개인 빈 세션은 묻지 않는다) */}
        {recentSession && recentSession._count.messages > 0 && (
          <div className="-mt-10 mb-14">
            <ResumePrompt
              sessionId={recentSession.id}
              title={recentSession.title}
              messageCount={recentSession._count.messages}
              updatedAt={recentSession.updatedAt.toISOString()}
            />
          </div>
        )}

        {/* 문서 사이트맵 — 카드 대신 계층형 링크 트리 */}
        <section className="mb-14">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-4">DOCS SITEMAP</h2>
          <div className="rounded-2xl border border-ink/10 bg-white p-6 sm:p-8">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {DOCS_SITEMAP.map((section) => (
                <div key={section.group}>
                  <p className="mb-3 border-b border-ink/10 pb-2 text-sm font-bold text-ink">
                    <I18nSlot k={section.groupKey} fallback={section.group} />
                  </p>
                  <ul className="space-y-0.5 border-l border-ink/10">
                    {section.links.map((link) => {
                      const inner = (
                        <>
                          <span className="font-medium text-ink-soft/80 group-hover:text-brand-600 transition-colors">
                            {link.titleKey ? <I18nSlot k={link.titleKey} fallback={link.title} /> : link.title}
                            {link.external && <span className="ml-1 text-[10px] text-ink-soft/35">↗</span>}
                          </span>
                          <span className="block text-xs text-ink-soft/45">
                            {link.descKey ? <I18nSlot k={link.descKey} fallback={link.desc} /> : link.desc}
                          </span>
                        </>
                      );
                      return (
                        <li key={link.title} className="relative pl-4 before:absolute before:left-0 before:top-[0.95rem] before:h-px before:w-2.5 before:bg-ink/10">
                          {link.external ? (
                            <a href={link.href} target="_blank" rel="noreferrer" className="group block rounded-md px-2 py-1.5 text-sm hover:bg-paper/80">
                              {inner}
                            </a>
                          ) : (
                            <Link href={link.href} className="group block rounded-md px-2 py-1.5 text-sm hover:bg-paper/80">
                              {inner}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* 문서 하단 액션 — 한국어 번역본(준비중) + debateAI와 함께 배우기(AI 설정 시) */}
          <div className="mt-5 flex flex-col sm:flex-row flex-wrap justify-center gap-3">
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="inline-flex items-center gap-2 rounded-lg border border-ink/12 bg-paper px-4 py-2.5 text-sm font-medium text-ink-soft/45 cursor-not-allowed"
            >
              <I18nSlot k="ko-docs-link" fallback="한국어 번역본 준비 중" />
            </button>
          </div>
        </section>
    </PageShell>
  );
}
