'use client';

// 브릴리언트식 레슨 플레이어 — 상단 [닫기 X | 진행바 | 레슨 점] 크롬 아래에
// 레슨 markdown을 `---` 또는 `## ` 단위 스텝으로 잘라 한 장씩 보여주고,
// 하단 Continue 버튼으로 전진한다. 마지막 스텝에서 완료 처리 후 다음 레슨으로 이어진다.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markLessonComplete } from '@/app/lib/actions/study';

export interface LessonMeta {
  slug: string;
  title: string;
  completed: boolean;
}

// markdown을 스텝으로 분할 — 명시적 `---` 구분자를 우선하고, 없으면 `## ` 섹션 단위로 나눈다.
function splitSteps(content: string): string[] {
  const byRule = content
    .split(/\n-{3,}\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byRule.length > 1) return byRule;

  const byHeading = content
    .split(/\n(?=##\s)/)
    .map((s) => s.trim())
    .filter(Boolean);
  return byHeading.length > 0 ? byHeading : [content.trim()];
}

const PROSE =
  'text-[15px] leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-fg [&_h2]:mb-4 [&_p]:my-2.5 [&_p]:text-fg [&_li]:text-fg [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:bg-paper [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-ink [&_pre]:text-white [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_table]:my-3 [&_th]:text-left [&_th]:font-mono [&_th]:text-xs [&_th]:text-fg-muted [&_th]:border-b [&_th]:border-hairline [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-hairline';

export default function LessonPlayer({
  courseSlug,
  courseTitle,
  lessonId,
  lessonTitle,
  content,
  lessonIndex,
  lessons,
  completed,
  loggedIn,
}: {
  courseSlug: string;
  courseTitle: string;
  lessonId: number;
  lessonTitle: string;
  content: string;
  lessonIndex: number;
  lessons: LessonMeta[];
  completed: boolean;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const steps = useMemo(() => splitSteps(content), [content]);

  const isLast = step === steps.length - 1;
  const next = lessons[lessonIndex + 1] ?? null;
  const pct = Math.round(((step + 1) / steps.length) * 100);

  const finish = () => {
    const go = () => (next ? router.push(`/study/${courseSlug}/${next.slug}`) : router.push(`/study/${courseSlug}`));
    if (loggedIn && !completed) {
      startTransition(async () => {
        const fd = new FormData();
        fd.set('lessonId', String(lessonId));
        fd.set('courseSlug', courseSlug);
        await markLessonComplete(fd);
        go();
        router.refresh();
      });
    } else {
      go();
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-fg">
      <style>{`@keyframes lesson-step-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }`}</style>

      {/* 상단 크롬 — 닫기 / 레슨 내 진행바 / 코스 레슨 점 */}
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-5">
          <Link
            href={`/study/${courseSlug}`}
            aria-label="레슨 닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-muted transition hover:bg-paper hover:text-fg"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 6.6 3 1.6 1.6 3 6.6 8l-5 5L3 14.4l5-5 5 5 1.4-1.4-5-5 5-5L13 1.6l-5 5Z" fill="currentColor" />
            </svg>
          </Link>

          <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-emerald-500 transition-colors duration-300" style={{ width: `${pct}%` }} />
          </div>

          <div className="flex shrink-0 items-center gap-1.5" aria-label="코스 진행 상황">
            {lessons.map((l, i) => (
              <span
                key={l.slug}
                title={l.title}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  i === lessonIndex
                    ? 'bg-brand-600 ring-2 ring-brand-200'
                    : l.completed
                      ? 'bg-emerald-500'
                      : 'bg-ink/10'
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* 스텝 콘텐츠 */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-10">
        <p className="mb-6 text-xs font-bold uppercase tracking-wider text-brand-600">
          {courseTitle} <span className="text-fg-quiet">/</span> {lessonTitle}
        </p>
        <div key={step} className="mx-auto w-full max-w-xl" style={{ animation: 'lesson-step-in .28s ease' }}>
          {step === 0 && (
            <h1 className="mb-6 font-display text-3xl font-bold tracking-tight text-fg">{lessonTitle}</h1>
          )}
          <div className={PROSE}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{steps[step]}</ReactMarkdown>
          </div>
        </div>
      </main>

      {/* 하단 컨트롤 — 이전 / 스텝 카운터 / Continue */}
      <footer className="sticky bottom-0 border-t border-hairline bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-4">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="rounded-full border border-hairline px-5 py-3 text-sm font-semibold text-fg-secondary transition hover:border-ink/25 hover:text-fg"
            >
              ← 이전
            </button>
          ) : (
            <span />
          )}
          <span className="ml-auto font-mono text-xs text-fg-quiet">
            {step + 1} / {steps.length}
          </span>
          {!isLast ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded-full bg-brand-600 px-9 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 active:scale-[0.98]"
            >
              계속하기
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={pending}
              className="rounded-full bg-emerald-600 px-9 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-60"
            >
              {pending ? '저장 중…' : next ? (completed || !loggedIn ? '다음 레슨 →' : '완료하고 다음 레슨 →') : completed || !loggedIn ? '코스로 돌아가기' : '레슨 완료 🎉'}
            </button>
          )}
        </div>
        {!loggedIn && isLast && (
          <p className="pb-3 text-center text-xs text-fg-quiet">
            <Link href="/login" className="text-brand-600 underline underline-offset-2">로그인</Link>하면 학습 진행률이 저장됩니다.
          </p>
        )}
      </footer>
    </div>
  );
}
