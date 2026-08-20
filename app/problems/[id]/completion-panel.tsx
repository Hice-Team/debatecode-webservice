'use client';

// 정답 이후 화면 — 모드에 따라 흐름이 갈린다.
//
//   시그니처모드 → Learning Flow : 학습 완료를 알리고 바로 다음 문제로 넘긴다.
//                                  (AI 면접관이 코드를 분석한다는 화면을 쓰지 않는다)
//   디베이트/리팩토링 → Interview Flow : 정답 확인 → Continue
import Link from 'next/link';
import type { CompletionCta } from './entry-context';

export type CompletionMode = 'signature' | 'debate' | 'refactor';

export default function CompletionPanel({
  mode,
  correct,
  cta,
  onContinue,
  onRetry,
}: {
  mode: CompletionMode;
  correct: boolean;
  cta: CompletionCta;
  onContinue: () => void;
  onRetry: () => void;
}) {
  // ---------- 오답 ----------
  if (!correct) {
    return (
      <div className="absolute inset-0 z-20 grid place-items-center bg-ink/85 p-6 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-[var(--radius-panel)] border border-rose-500/30 bg-[#12141C] p-6 text-center">
          <p className="text-4xl">🤔</p>
          <p className="mt-3 text-xl font-bold text-rose-300" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Try again.
          </p>
          <p className="mt-1.5 text-sm text-fg-on-dark-muted">다시 한 번 확인해 보세요.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            다시 풀기
          </button>
        </div>
      </div>
    );
  }

  // ---------- 시그니처모드: 학습 완료 ----------
  if (mode === 'signature') {
    return (
      <div className="absolute inset-0 z-20 grid place-items-center bg-ink/85 p-6 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-[var(--radius-panel)] border border-emerald-500/30 bg-[#12141C] p-6 text-center">
          <p className="text-4xl">🎉</p>
          <p className="mt-3 text-xl font-bold text-emerald-300" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Correct!
          </p>
          <p className="mt-1.5 text-sm text-fg-on-dark-secondary">문제를 해결했습니다.</p>

          <Link
            href={cta.href}
            className="mt-5 block w-full rounded-xl bg-signal py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98]"
          >
            {cta.label}
          </Link>
          <button
            type="button"
            onClick={onContinue}
            className="mt-2 w-full rounded-xl border border-white/15 py-2.5 text-sm font-medium text-fg-on-dark-secondary transition hover:border-white/35 hover:text-white"
          >
            이 문제 계속 보기
          </button>
        </div>
      </div>
    );
  }

  // ---------- 디베이트 / 리팩토링: 면접형 ----------
  return (
    <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-ink/85 p-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[var(--radius-panel)] border border-emerald-500/30 bg-[#12141C] p-6">
        <div className="text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 text-xl font-bold text-emerald-300" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Correct!
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href={cta.href}
            className="flex-1 rounded-xl bg-signal py-2.5 text-center text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98]"
          >
            Continue
          </Link>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-2 w-full text-xs text-fg-on-dark-quiet transition hover:text-fg-on-dark-secondary"
        >
          이 문제 계속 보기
        </button>
      </div>
    </div>
  );
}
