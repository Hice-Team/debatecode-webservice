'use client';

// 태블릿 접속 안내 — 에디터를 열되, 데스크톱과 다르게 동작한다는 사실을 먼저 알린다.
//
// 태블릿은 막지 않는다(폭이 나온다). 다만 세로로 들면 좌 패널과 에디터가 위아래로 쌓여
// 데스크톱과 다른 배치가 되는데, 이유를 모르면 화면이 깨진 것으로 읽힌다. 그래서 한 번만 알린다.
// 한 번 닫으면 이 브라우저에서는 다시 뜨지 않는다 — 매번 같은 안내를 읽힐 이유가 없다.
import { useEffect, useState } from 'react';

const DISMISS_KEY = 'dc:tablet-notice-dismissed';

export default function TabletNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 하이드레이션 후에만 읽을 수 있다
      if (window.localStorage.getItem(DISMISS_KEY) !== 'yes') setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, 'yes');
    } catch {
      // 저장소를 못 쓰면 이번 접속에만 닫힌다
    }
  }

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-brand-400/25 bg-signal/10 px-4 py-2 text-[12px] text-brand-200"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.6]" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M12 17h.01" strokeLinecap="round" />
      </svg>
      <p className="min-w-0 leading-relaxed">
        <strong className="font-semibold">태블릿 모드로 전환되었습니다.</strong>{' '}
        <span className="text-brand-200/70">
          가로로 돌리면 문제 패널과 에디터를 나란히 볼 수 있습니다. 외장 키보드를 연결하면 더 편합니다.
        </span>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="안내 닫기"
        className="ml-auto shrink-0 rounded-lg border border-brand-400/30 px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-brand-400/10"
      >
        확인
      </button>
    </div>
  );
}
