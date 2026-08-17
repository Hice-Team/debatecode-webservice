'use client';

// 풀이 시계 — 자유모드는 경과 시간을 세고(스톱워치), 엄격모드는 남은 시간을 센다(카운트다운).
//
// 기준은 상태가 아니라 setup.startedAt(입장 시각)이다. 탭이 백그라운드로 내려가 틱을 몇 번
// 건너뛰어도, 새로고침으로 컴포넌트가 다시 마운트돼도 시각 차이로 계산해 어긋나지 않는다.
import { useEffect, useState } from 'react';
import { elapsedMs, formatClock, remainingMs, type SolveSetup } from '@/app/lib/solve-session';

export default function SolveTimer({
  setup,
  stopped = false,
  onTimeUp,
}: {
  setup: SolveSetup;
  /** 시간 종료·정답 등으로 시계를 멈춰야 할 때 */
  stopped?: boolean;
  /** 엄격모드에서 남은 시간이 0이 되는 순간 한 번 호출된다 */
  onTimeUp?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (stopped) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [stopped]);

  const left = remainingMs(setup, now);
  const strict = left !== null;

  useEffect(() => {
    if (strict && left === 0) onTimeUp?.();
  }, [strict, left, onTimeUp]);

  const ms = strict ? left : elapsedMs(setup, now);
  // 남은 1분 — 색만으로 알리면 놓치므로 깜빡임을 함께 준다(motion-reduce에서는 색만)
  const urgent = strict && left <= 60_000;

  return (
    <span
      role="timer"
      aria-live="off"
      title={strict ? `제한 ${setup.limitMinutes}분` : '경과 시간 (시간 제한 없음)'}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] tabular-nums ${
        urgent
          ? 'border-rose-500/40 bg-rose-500/15 text-rose-200 motion-safe:animate-pulse'
          : strict
            ? 'border-white/15 bg-white/5 text-white/75'
            : 'border-white/15 bg-white/5 text-white/60'
      }`}
    >
      <span aria-hidden>{strict ? '⏳' : '⏱'}</span>
      {formatClock(ms)}
    </span>
  );
}
