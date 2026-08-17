'use client';

// 워크스페이스 전용 커스텀 스플리터 — 브라우저 기본 resize 대신 포인터 드래그로
// 좌/우 패널·에디터/터미널 비율을 조절한다. 값은 localStorage에 저장돼 유지된다.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// 분할 비율 상태 — storageKey로 localStorage에 저장/복원한다 (min~max %로 clamp)
export function useSplitPct(storageKey: string, initial: number, min: number, max: number) {
  const [pct, setPct] = useState(initial);
  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    const v = raw === null ? NaN : parseFloat(raw);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 복원은 하이드레이션 후에만 가능
    if (!Number.isNaN(v)) setPct(clamp(v, min, max));
  }, [storageKey, min, max]);
  const update = useCallback(
    (next: number) => {
      const v = clamp(next, min, max);
      setPct(v);
      window.localStorage.setItem(storageKey, String(v));
    },
    [storageKey, min, max],
  );
  return [pct, update] as const;
}

// 드래그 핸들 — axis='x'는 좌우 분할(세로 바), 'y'는 상하 분할(가로 바).
// containerRef 기준 포인터 위치를 %로 환산해 onPct로 넘긴다.
export function SplitHandle({
  axis,
  containerRef,
  onPct,
  label,
  className = '',
}: {
  axis: 'x' | 'y';
  containerRef: RefObject<HTMLElement | null>;
  onPct: (pct: number) => void;
  label: string;
  className?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  const move = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    onPct(
      axis === 'x'
        ? ((clientX - rect.left) / rect.width) * 100
        : ((clientY - rect.top) / rect.height) * 100,
    );
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        draggingRef.current = true;
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) move(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        draggingRef.current = false;
        setDragging(false);
      }}
      className={`group flex shrink-0 touch-none select-none items-center justify-center ${
        axis === 'x' ? 'w-3 cursor-col-resize' : 'h-3 cursor-row-resize'
      } ${className}`}
    >
      {/* 그립 — 평소엔 흐릿한 점 바, 호버/드래그 시 브랜드 컬러로 살아난다 */}
      <div
        className={`rounded-full transition-all ${
          axis === 'x' ? 'h-12 w-1 group-hover:h-16' : 'h-1 w-12 group-hover:w-16'
        } ${dragging ? 'bg-brand-400 shadow-[0_0_10px_rgba(125,120,251,0.6)]' : 'bg-white/15 group-hover:bg-brand-400/70'}`}
      />
    </div>
  );
}
