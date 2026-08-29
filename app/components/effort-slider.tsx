'use client';

// 사고 강도 슬라이더 — 모델 선택 메뉴 안에 들어간다.
//
// 모델과 강도는 "무엇으로, 얼마나 깊게"라는 한 판단의 두 축이라 같은 메뉴에 둔다.
// 여섯 단계라 칸을 나열하면 좁은 메뉴에서 글자가 뭉개진다. 그래서 눈금 슬라이더로 두고
// 지금 값은 제목 옆에 이름으로 밝힌다 — 손잡이 위치만으로는 어느 단계인지 읽기 어렵다.
//
// 조작은 실제 <input type="range">가 맡는다(투명하게 덮어 둔다).
// 키보드 화살표·터치 드래그·접근성 트리를 브라우저가 그대로 처리해 주기 때문이다.
import {
  EFFORTS,
  EFFORT_HINTS,
  EFFORT_LABELS,
  EFFORT_LABELS_EN,
  effortAt,
  effortIndex,
  type Effort,
} from '@/app/lib/ai/effort';

export default function EffortSlider({
  value,
  onChange,
  disabled,
  tone = 'light',
}: {
  value: Effort;
  onChange: (next: Effort) => void;
  disabled?: boolean;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  const index = effortIndex(value);
  const last = EFFORTS.length - 1;
  // 손잡이 중심이 양끝 눈금에 정확히 맞도록 트랙 안쪽으로 환산한다
  const percent = (index / last) * 100;

  return (
    <div className={`px-3 py-2 ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-[1.6] ${dark ? 'text-fg-on-dark-muted' : 'text-fg-muted'}`}
          aria-hidden
        >
          <path d="M6 4v16M18 4v16" strokeLinecap="round" />
          <path d="M9 9h6M9 15h6" strokeLinecap="round" />
        </svg>
        <span className={`text-[12px] font-medium ${dark ? 'text-fg-on-dark' : 'text-fg'}`}>Effort</span>
        <span className={`text-[11px] ${dark ? 'text-fg-on-dark-quiet' : 'text-fg-muted'}`}>
          ({EFFORT_LABELS_EN[value]})
        </span>

        {/* 트랙 — 눈금 여섯 개 위에 손잡이가 얹힌다 */}
        <div className="relative ml-auto h-5 w-[92px] shrink-0">
          <span
            aria-hidden
            className={`absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full ${
              dark ? 'bg-surface/10' : 'bg-ink/10'
            }`}
          />
          {/* 지나온 구간 */}
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-brand-400 to-signal"
            style={{ width: `${percent}%` }}
          />
          {/* 눈금 */}
          {EFFORTS.map((step, i) => (
            <span
              key={step}
              aria-hidden
              className={`absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                i <= index ? 'bg-transparent' : dark ? 'bg-surface/25' : 'bg-ink/20'
              }`}
              style={{ left: `${(i / last) * 100}%` }}
            />
          ))}
          {/* 손잡이 */}
          <span
            aria-hidden
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-sm transition-[left] duration-100 ${
              dark ? 'border-white/20 bg-surface' : 'border-hairline bg-surface'
            }`}
            style={{ left: `${percent}%` }}
          />
          {/* 실제 조작 — 투명하게 덮어 키보드·터치를 브라우저에 맡긴다 */}
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={index}
            disabled={disabled}
            onChange={(e) => onChange(effortAt(Number(e.target.value)))}
            aria-label={`응답 강도 — ${EFFORT_LABELS[value]}`}
            aria-valuetext={EFFORT_LABELS[value]}
            title={EFFORT_HINTS[value]}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
          />
        </div>
      </div>
      <p className={`mt-1 pl-[22px] text-[10.5px] leading-relaxed ${dark ? 'text-fg-on-dark-quiet' : 'text-fg-muted'}`}>
        {EFFORT_HINTS[value]}
      </p>
    </div>
  );
}
