'use client';

// debateAI 모델 선택 — 입력바 안에 들어가는 드롭다운.
//
// 네이티브 <select>를 쓰지 않는 이유는 두 가지다.
//   1) 티어 설명·모델 한 줄 소개를 옵션에 담을 수 없다. optgroup 라벨에 몰아넣으면 길어져 잘린다.
//   2) 어두운 워크스페이스에서 OS 기본 팝업만 밝게 떠 이질적으로 보인다.
// 버튼은 이름만 조용히 보여주고, 열었을 때만 티어와 설명이 드러나게 했다.
import { useEffect, useRef, useState } from 'react';
import {
  ROLE_LABELS,
  ROLE_NOTES,
  TIER_LABELS,
  TIER_NOTES,
  findDebateAiModel,
  groupByRole,
  groupedModels,
  modelAvailability,
  type DebateAiModelId,
} from '@/app/lib/ai/debateai-models';
import EffortSlider from '@/app/components/effort-slider';
import { EFFORT_LABELS_EN, type Effort } from '@/app/lib/ai/effort';

export default function ModelMenu({
  value,
  onChange,
  effort,
  onEffortChange,
  disabled,
  access,
}: {
  value: DebateAiModelId;
  onChange: (id: DebateAiModelId) => void;
  effort: Effort;
  onEffortChange: (next: Effort) => void;
  disabled?: boolean;
  access: { hasOwnKey: boolean; hasLocalEndpoint: boolean };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = findDebateAiModel(value);

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
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="debateAI 모델 선택"
        title={`${current.label} · ${TIER_LABELS[current.tier]} · Effort ${EFFORT_LABELS_EN[effort]}`}
        className={`flex h-7 min-w-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium transition-colors disabled:opacity-40 ${
          open ? 'bg-white/10 text-white' : 'text-fg-on-dark-muted hover:bg-white/[0.07] hover:text-fg-on-dark'
        }`}
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-brand-300 to-signal"
        />
        <span className="truncate">{current.label}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 shrink-0 fill-none stroke-current stroke-2 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="debateAI 모델"
          className="dc-scroll absolute bottom-full left-0 z-50 mb-2 max-h-[18rem] w-[17rem] max-w-[calc(100vw-3rem)] overflow-y-auto rounded-xl border border-white/10 bg-[#171A24] py-1.5 shadow-2xl shadow-black/50"
        >
          {groupedModels().map((group) => (
            <div key={group.tier} className="py-0.5">
              <p className="border-b border-white/[0.06] px-3 pb-1.5 pt-2 font-mono text-[9px] uppercase tracking-wider text-fg-on-dark-quiet">
                {TIER_LABELS[group.tier]}
                <span className="ml-1 normal-case tracking-normal text-fg-on-dark-quiet">{TIER_NOTES[group.tier]}</span>
              </p>
              {/* 티어 안을 다시 기능별로 나눈다 — 이름만 열세 개 늘어놓으면 고를 수 없다 */}
              {groupByRole(group.models).map((sub) => (
                <div key={sub.role ?? 'etc'}>
                  {sub.role && (
                    <p
                      className="px-3 pb-0.5 pt-2 text-[10px] font-semibold text-fg-on-dark-muted"
                      title={ROLE_NOTES[sub.role]}
                    >
                      {ROLE_LABELS[sub.role]}
                    </p>
                  )}
                  {sub.models.map((model) => {
                    const { usable, reason } = modelAvailability(model, access);
                    const selected = model.id === current.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={!usable}
                        title={usable ? model.hint : reason}
                        onClick={() => {
                          onChange(model.id);
                          setOpen(false);
                        }}
                        className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors ${
                          usable ? 'hover:bg-white/[0.06]' : 'cursor-not-allowed opacity-35'
                        } ${selected ? 'bg-signal/15' : ''}`}
                      >
                        <span
                          className={`truncate text-[12px] ${selected ? 'font-semibold text-brand-200' : 'text-fg-on-dark'}`}
                        >
                          {model.label}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[9px] text-fg-on-dark-quiet">{model.vendor}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
          {/* 응답 강도 — 모델 목록 아래, 같은 메뉴 안에서 이어서 고른다 */}
          <div className="mt-1 border-t border-white/[0.07] pt-1">
            <EffortSlider value={effort} onChange={onEffortChange} tone="dark" />
          </div>

          {/* 못 고르는 모델이 왜 잠겨 있는지 — 목록 끝에 한 번만 적는다 */}
          {!access.hasOwnKey && (
            <p className="mx-1.5 mt-1 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[10px] leading-relaxed text-fg-on-dark-quiet">
              설정 → 서비스에서 내 API 키를 등록하면 상용 모델(ChatGPT · Claude · Gemini · Grok · Perplexity)을 쓸 수
              있습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
