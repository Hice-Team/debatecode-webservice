'use client';

// 전역 오류 화면.
//
// 이 저장소에는 오류 경계가 한 곳도 없었다. 그래서 서버 컴포넌트 하나가 던지면 이용자는
// 아무 설명 없는 기본 오류 화면을 봤고, 어디가 잘못됐는지도 다시 시도할 방법도 알 수 없었다.
// "설정 페이지에 접속이 안 된다"는 신고가 그런 모양이었다.
//
// 여기서는 세 가지만 한다 — 무슨 일이 났는지 한 줄, 다시 시도, 빠져나갈 링크.
// 오류 내용 자체는 보여 주지 않는다(스택에 내부 경로와 쿼리가 섞여 나온다).
// 개발 중에는 콘솔에 그대로 남기고, digest는 문의 시 대조할 수 있게 작게 적어 둔다.
import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-[70vh] place-items-center bg-paper px-4 py-16">
      <div className="w-full max-w-md rounded-[var(--radius-panel)] border border-hairline bg-surface p-8 text-center shadow-sm">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-rose-600">Error</p>
        <h1
          className="mt-2 text-2xl font-bold tracking-tight text-fg"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          화면을 불러오지 못했습니다
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
          일시적인 문제일 수 있습니다. 다시 시도해 보시고, 계속 같은 화면이 나오면 문의해 주세요.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            다시 시도
          </button>
          <Link
            href="/dashboard"
            className="rounded-xl border border-hairline px-4 py-2 text-sm font-medium text-fg-secondary transition hover:border-fg-quiet"
          >
            대시보드로
          </Link>
        </div>

        {error.digest && (
          <p className="mt-5 font-mono text-[10px] text-fg-quiet">오류 코드 {error.digest}</p>
        )}
      </div>
    </main>
  );
}
