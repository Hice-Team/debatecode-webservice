'use client';

// 추천 프롬프트 — 입력창 바로 위의 가로 슬라이드.
//
// 목록이 길어 줄바꿈으로 쌓으면 입력창을 밀어내므로 한 줄에 두고 옆으로 넘긴다.
// 넓은 화면에서는 좌우 화살표로, 좁은 화면·터치에서는 스와이프로 넘어간다.
// 접기 상태는 이 브라우저에 기억한다 — 매번 닫는 사람에게 매번 열어 주지 않기 위해서다.
import { useEffect, useRef, useState } from 'react';

const OPEN_KEY = 'dc:debateai:suggestions-open';

export default function PromptSuggestions({
  items,
  onPick,
  disabled,
}: {
  items: string[];
  onPick: (prompt: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [edges, setEdges] = useState({ left: false, right: false });
  const railRef = useRef<HTMLDivElement>(null);

  // 접기 상태 복원 — localStorage는 하이드레이션 후에만 읽을 수 있다
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장값 복원
      if (window.localStorage.getItem(OPEN_KEY) === 'no') setOpen(false);
    } catch {
      // 저장소를 못 읽으면 펼친 상태로 둔다
    }
  }, []);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(OPEN_KEY, next ? 'yes' : 'no');
      } catch {
        // 저장 실패는 무시
      }
      return next;
    });
  }

  /** 양끝에 닿았는지 — 화살표와 페이드를 켤지 정한다 */
  function syncEdges() {
    const el = railRef.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }

  useEffect(() => {
    if (!open) return;
     
    syncEdges();
  }, [open, items]);

  function nudge(dir: -1 | 1) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  }

  if (items.length === 0) return null;

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1 font-mono text-[10px] tracking-wider text-white/35 transition-colors hover:text-white/60"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-3 w-3 fill-none stroke-current stroke-2 transition-transform ${open ? '' : '-rotate-90'}`}
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          추천 질문
          <span className="text-white/20">{items.length}</span>
        </button>
      </div>

      {open && (
        <div className="relative mt-1.5">
          {/* 좌우 페이드 — 더 넘길 것이 남았음을 알린다 */}
          {edges.left && (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[#12141C] to-transparent" />
          )}
          {edges.right && (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[#12141C] to-transparent" />
          )}

          {edges.left && (
            <button
              type="button"
              onClick={() => nudge(-1)}
              aria-label="이전 추천 질문"
              className="absolute left-0 top-1/2 z-20 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#12141C] text-white/50 transition-colors hover:text-white sm:grid"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-2" aria-hidden>
                <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {edges.right && (
            <button
              type="button"
              onClick={() => nudge(1)}
              aria-label="다음 추천 질문"
              className="absolute right-0 top-1/2 z-20 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#12141C] text-white/50 transition-colors hover:text-white sm:grid"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-2" aria-hidden>
                <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          <div
            ref={railRef}
            onScroll={syncEdges}
            className="dc-scroll-none flex gap-1.5 overflow-x-auto scroll-smooth"
          >
            {items.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={disabled}
                onClick={() => onPick(prompt)}
                title={prompt}
                className="shrink-0 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/60 transition-colors hover:border-brand-400/50 hover:bg-brand-600/15 hover:text-white disabled:opacity-40"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
