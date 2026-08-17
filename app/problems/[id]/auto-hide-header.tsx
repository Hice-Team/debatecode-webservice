'use client';

// 코드 에디터 페이지 전용 헤더 래퍼 — 밝은 헤더가 다크 워크스페이스와 겹치지 않게
// 평소엔 숨겨두고, 화면 상단 "가운데" 영역에 커서를 잠시 유지하면 슬라이드로 나타난다.
// 헤더 하단 중앙의 핀 탭으로 항상 고정할 수 있다 (localStorage에 저장).
import { useEffect, useRef, useState } from 'react';

const PIN_KEY = 'dc:ws:header-pinned';
const REVEAL_DELAY_MS = 250;

function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    // 하단 "중앙"에 매다는 작은 탭 — 우측 프로필/좌측 로고 등 헤더 UI와 겹치지 않는다
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      title={pinned ? '헤더 자동 숨김으로 전환' : '헤더 항상 고정'}
      className={`absolute left-1/2 top-full z-[70] flex -translate-x-1/2 items-center gap-1.5 rounded-b-lg border border-t-0 px-3 py-1 font-mono text-[10px] font-semibold shadow-lg backdrop-blur transition-colors ${
        pinned
          ? 'border-brand-400/50 bg-signal text-white hover:bg-brand-600'
          : 'border-white/20 bg-ink/85 text-white/70 hover:border-white/40 hover:text-white'
      }`}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M9.5 1.5 14.5 6.5 13 8l-.7-.7-2.8 2.8.5 2.9-1.4 1.4-3-3L2 15l-1-1 3.6-3.6-3-3L3 6l2.9.5 2.8-2.8L8 3l1.5-1.5Z" />
      </svg>
      {pinned ? '고정됨' : '고정'}
    </button>
  );
}

export default function AutoHideHeader({ children }: { children: React.ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const [visible, setVisible] = useState(false);
  const revealTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 복원은 하이드레이션 후에만 가능
    setPinned(window.localStorage.getItem(PIN_KEY) === '1');
    return () => window.clearTimeout(revealTimer.current);
  }, []);

  const togglePin = () => {
    setPinned((prev) => {
      window.localStorage.setItem(PIN_KEY, prev ? '0' : '1');
      return !prev;
    });
  };

  if (pinned) {
    return (
      <div className="relative z-50 shrink-0">
        {children}
        <PinButton pinned onToggle={togglePin} />
      </div>
    );
  }

  return (
    <>
      {/* 상단 중앙 감지 영역 — 커서를 잠시 유지하면(또는 탭하면) 헤더가 나타난다 */}
      <div
        aria-hidden
        onMouseEnter={() => {
          revealTimer.current = window.setTimeout(() => setVisible(true), REVEAL_DELAY_MS);
        }}
        onMouseLeave={() => window.clearTimeout(revealTimer.current)}
        onClick={() => setVisible(true)}
        className="fixed left-1/2 top-0 z-[60] h-3 w-[min(560px,70vw)] -translate-x-1/2 rounded-b-full bg-gradient-to-b from-brand-500/30 to-transparent"
      />
      <div
        onMouseLeave={() => setVisible(false)}
        className={`fixed inset-x-0 top-0 z-50 transition-transform duration-300 ease-out ${
          visible ? 'translate-y-0' : '-translate-y-[110%]'
        }`}
      >
        <div className="relative shadow-xl shadow-black/30">
          {children}
          <PinButton pinned={false} onToggle={togglePin} />
        </div>
      </div>
    </>
  );
}
