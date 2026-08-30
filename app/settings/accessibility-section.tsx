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
import Toggle from '@/app/components/toggle';
import { THEME_ORDER, applyTheme, readTheme, subscribeTheme, type ThemeChoice } from '@/app/lib/theme';
import {
  readReduceMotion,
  setReduceMotion,
  subscribeReduceMotion,
  readSpeechRate,
  setSpeechRate,
  subscribeSpeechRate,
  readHighContrast,
  setHighContrast,
  subscribeHighContrast,
} from '@/app/lib/ui-preferences';

const THEME_LABEL: Record<ThemeChoice, string> = {
  system: '시스템 설정 따르기',
  light: '라이트',
  dark: '다크',
};

const ROW = 'flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-4 last:border-b-0';

export default function AccessibilitySection() {
  const reduceMotion = useSyncExternalStore(subscribeReduceMotion, readReduceMotion, () => false);
  const rate = useSyncExternalStore(subscribeSpeechRate, readSpeechRate, () => 1 as SpeechRate);
  const highContrast = useSyncExternalStore(subscribeHighContrast, readHighContrast, () => false);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as ThemeChoice);

  return (
    <div>
      <div className={ROW}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">화면 테마</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">
            상단 내비게이션의 버튼과 같은 설정입니다. 이 기기에만 적용됩니다.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-fg-secondary">
          <span className="sr-only">화면 테마</span>
          <select
            value={theme}
            onChange={(e) => applyTheme(e.target.value as ThemeChoice)}
            className="rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-1.5 text-sm text-fg focus:border-signal focus:outline-none"
          >
            {THEME_ORDER.map((value) => (
              <option key={value} value={value}>
                {THEME_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={ROW}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">고대비</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">
            글자와 경계선의 대비를 높이고 초점 링을 굵게 만듭니다. 성공·주의·위험을 알리는
            색은 그대로 둡니다 — 그것까지 지우면 무엇이 잘못됐는지 읽을 수 없게 됩니다.
          </p>
        </div>
        <Toggle checked={highContrast} onChange={setHighContrast} label="고대비" />
      </div>

      <div className={ROW}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">움직임 줄이기</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">
            화면 전환과 애니메이션을 최소로 줄입니다. 이 기기에만 적용되며, 운영체제에 이미
            &apos;동작 줄이기&apos;가 켜져 있으면 그 설정이 우선합니다.
          </p>
        </div>
        <Toggle checked={reduceMotion} onChange={setReduceMotion} label="움직임 줄이기" />
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
