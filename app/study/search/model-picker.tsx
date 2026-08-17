'use client';

// 모델 선택 드롭다운 — 알약 검색바 안에 들어간다.
// 고른 모델은 세션에 저장되어 다음 질문부터 적용된다.
//
// 응답 강도(Effort)도 이 메뉴 안에 둔다. "무엇으로 답할지"와 "얼마나 깊게 답할지"는
// 한 판단의 두 축이고, 입력바에 컨트롤을 하나 더 늘리면 좁은 화면에서 입력창이 잘린다.
import { useEffect, useRef, useState } from 'react';
import { SEARCH_MODELS, findSearchModel } from '@/app/lib/ai/search-models';
import EffortSlider from '@/app/components/effort-slider';
import { EFFORT_LABELS_EN, type Effort } from '@/app/lib/ai/effort';

export default function ModelPicker({
  value,
  onChange,
  effort,
  onEffortChange,
  disabled,
  /** 모델 호출 키가 없으면 선택해도 실제로는 문서 검색 모드로 동작한다 */
  live,
  /** 메뉴가 열리는 방향 — 하단 컴포저는 위로, 히어로 검색바는 아래로 편다 */
  placement = 'top',
}: {
  value: string;
  onChange: (id: string) => void;
  effort: Effort;
  onEffortChange: (next: Effort) => void;
  disabled?: boolean;
  live: boolean;
  placement?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = findSearchModel(value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={
          live
            ? `${current.vendor} · ${current.label} · Effort ${EFFORT_LABELS_EN[effort]}`
            : '모델 키가 없어 문서 검색 모드로 동작합니다'
        }
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-ink-soft/60 transition hover:bg-paper hover:text-ink disabled:opacity-40 sm:px-3"
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? 'bg-gradient-to-br from-brand-400 to-brand-700' : 'bg-ink/20'}`}
        />
        {/* 좁은 화면에서는 이름을 접는다 — 알약 안에 입력 폭을 남겨야 한다 */}
        <span className="hidden max-w-[7rem] truncate sm:inline">{current.label}</span>
        <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 fill-none stroke-current stroke-2" aria-hidden>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="모델 선택"
          className={`absolute right-0 z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink/10 bg-white py-1.5 shadow-xl shadow-ink/10 animate-in fade-in duration-150 ${
            placement === 'top'
              ? 'bottom-full mb-2 slide-in-from-bottom-1'
              : 'top-full mt-2 slide-in-from-top-1'
          }`}
        >
          {!live && (
            <p className="mx-1.5 mb-1 rounded-lg bg-paper px-3 py-2 text-[11px] leading-relaxed text-ink-soft/50">
              모델 키가 설정되지 않아 지금은 문서 검색 결과만 제공합니다.
            </p>
          )}
          {SEARCH_MODELS.map((model) => {
            const selected = model.id === current.id;
            return (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(model.id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-paper ${
                  selected ? 'bg-brand-50/60' : ''
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-1 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border text-[8px] ${
                    selected ? 'border-signal bg-signal text-white' : 'border-ink/20 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    {model.label}
                    <span className="ml-1.5 font-mono text-[10px] font-normal text-ink-soft/40">{model.vendor}</span>
                    {/* 유료 표시 — 무료 모델과 섞여 있으니 고르기 전에 알 수 있어야 한다 */}
                    {model.paid && (
                      <span className="ml-1.5 rounded-full border border-brand-300/50 bg-brand-50 px-1.5 py-px align-middle text-[9px] font-semibold text-signal">
                        유료
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-soft/50">{model.hint}</span>
                </span>
              </button>
            );
          })}

          {/* 응답 강도 — 모델 목록 아래, 같은 메뉴 안에서 이어서 고른다 */}
          <div className="mt-1 border-t border-ink/[0.07] pt-1">
            <EffortSlider value={effort} onChange={onEffortChange} />
          </div>
        </div>
      )}
    </div>
  );
}
