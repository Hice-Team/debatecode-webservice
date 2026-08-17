'use client';

// 세그먼티드 컨트롤 — 난이도·모드가 공유하는 단일 디자인 시스템.
// 활성 배경은 별도 레이어로 두고 선택된 항목 위치로 transform 이동시켜,
// 색이 튀지 않고 부드럽게 미끄러지도록 한다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
  title?: string;
  disabled?: boolean;
  /** 라벨 뒤에 붙는 보조 표시(로딩 … 등) — 아이콘·점 인디케이터는 쓰지 않는다 */
  suffix?: React.ReactNode;
}

export default function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentOption<K>[];
  value: K;
  onChange: (next: K) => void;
  ariaLabel: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // 활성 버튼의 위치/너비를 재서 인디케이터를 맞춘다.
  // 레이아웃 확정 직후 측정해야 첫 페인트에서 어긋나지 않는다.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.querySelector<HTMLElement>(`[data-segment="${value}"]`);
    if (!activeEl) return;
    setIndicator({ left: activeEl.offsetLeft, width: activeEl.offsetWidth });
  }, [value, options]);

  // 폰트 로드·리사이즈로 너비가 바뀌면 다시 측정한다
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const activeEl = list.querySelector<HTMLElement>(`[data-segment="${value}"]`);
      if (activeEl) setIndicator({ left: activeEl.offsetLeft, width: activeEl.offsetWidth });
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative flex items-center gap-0.5"
    >
      {/* 슬라이딩 활성 배경 */}
      {indicator && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 rounded-md bg-signal transition-[transform,width] duration-250 ease-out motion-reduce:transition-none"
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      )}

      {options.map((option) => {
        const on = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={on}
            data-segment={option.key}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.key)}
            className={`relative z-10 whitespace-nowrap rounded-md px-3 py-1 transition-colors duration-200 disabled:opacity-50 ${
              on ? 'text-white' : 'text-white/45 hover:text-white/80'
            }`}
          >
            {option.label}
            {option.suffix}
          </button>
        );
      })}
    </div>
  );
}
