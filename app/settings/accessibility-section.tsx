'use client';

// 접근성 및 표시 설정 — 움직임 줄이기 · 낭독 속도.
//
// 둘 다 브라우저에만 저장한다(계정 컬럼을 만들지 않는다). 이유가 있다.
// 이 값들은 "이 사람"이 아니라 "이 기기"의 사정이다 — 회사 모니터에서는 애니메이션이
// 거슬리지 않지만 흔들리는 지하철에서는 거슬린다. 계정에 묶어 두면 기기를 옮길 때마다
// 맞지 않는 설정을 끌고 다니게 된다.
//
// 운영체제에 이미 '동작 줄이기'가 켜져 있으면 그 설정이 이깁니다 — 여기서 끌 수 없다.
// 접근성 설정을 앱이 덮어쓰면 안 되기 때문이다.
import { useSyncExternalStore } from 'react';
import { SPEECH_RATES, type SpeechRate } from '@/app/lib/speech';
import {
  readReduceMotion,
  setReduceMotion,
  subscribeReduceMotion,
  readSpeechRate,
  setSpeechRate,
  subscribeSpeechRate,
} from '@/app/lib/ui-preferences';

const ROW = 'flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-4 last:border-b-0';

export default function AccessibilitySection() {
  const reduceMotion = useSyncExternalStore(subscribeReduceMotion, readReduceMotion, () => false);
  const rate = useSyncExternalStore(subscribeSpeechRate, readSpeechRate, () => 1 as SpeechRate);

  return (
    <div>
      <div className={ROW}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">움직임 줄이기</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">
            화면 전환과 애니메이션을 최소로 줄입니다. 이 기기에만 적용되며, 운영체제에 이미
            &apos;동작 줄이기&apos;가 켜져 있으면 그 설정이 우선합니다.
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(e) => setReduceMotion(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-signal)]"
          />
          사용
        </label>
      </div>

      <div className={ROW}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">낭독 속도</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">
            AI 답변과 문제 해설을 소리로 들을 때의 기본 속도입니다.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-fg-secondary">
          <span className="sr-only">낭독 속도</span>
          <select
            value={rate}
            onChange={(e) => setSpeechRate(Number(e.target.value) as SpeechRate)}
            className="rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-1.5 text-sm text-fg focus:border-signal focus:outline-none"
          >
            {SPEECH_RATES.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
