'use client';

// 실전 모의고사 재진입 화면 — 나갔다 들어왔을 때 "이어서 풀지, 새로 시작할지"를 먼저 묻는다.
//
// 말없이 이어 붙이면 시간이 얼마나 흘렀는지 모른 채 다시 앉게 되고, 말없이 새로 시작하면
// 쓰던 코드가 사라진다. 어느 쪽도 조용히 결정할 일이 아니라 두 길을 나란히 놓는다.
//
// 엄격모드에서 제한 시간이 이미 지났으면 이어서 풀 수 있는 시험이 아니므로 새로 시작만 남는다.
import { SCAFFOLD_LABELS } from '@/app/lib/scaffold';
import {
  elapsedMs,
  formatClock,
  remainingMs,
  type SolveSetup,
  type WorkspaceMode,
} from '@/app/lib/solve-session';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

const MODE_LABEL_KEYS: Record<WorkspaceMode, string> = {
  signature: 'signature-mode',
  debate: 'debate-mode',
  refactor: 'refactor-mode',
};

export default function SolveResumePrompt({
  problemTitle,
  setup,
  onResume,
  onRestart,
}: {
  problemTitle: string;
  setup: SolveSetup;
  onResume: () => void;
  onRestart: () => void;
}) {
  const { language: uiLang } = useLanguage();

  const left = remainingMs(setup);
  const strict = left !== null;
  const expired = strict && left === 0;

  return (
    <div className="grid flex-grow place-items-center bg-ink px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12141C] p-6">
        <p className="font-mono text-[11px] tracking-wider text-brand-300">MOCK EXAM IN PROGRESS</p>
        <h2 className="mt-1 text-xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          {t('resume-title', uiLang)}
        </h2>
        <p className="mt-1.5 text-sm text-white/55">{problemTitle}</p>

        {/* 지금 어떤 상태로 남아 있는지 — 고른 조건과 시계를 그대로 보여 준다 */}
        <dl className="mt-5 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px]">
          <Row label={t('setup-mode', uiLang)} value={t(MODE_LABEL_KEYS[setup.mode], uiLang)} />
          {setup.mode !== 'refactor' && (
            <Row label={t('setup-level', uiLang)} value={SCAFFOLD_LABELS[setup.level]} />
          )}
          <Row
            label={t('setup-timer', uiLang)}
            value={
              strict
                ? `${t('timer-strict', uiLang)} · ${setup.limitMinutes}${t('minutes-short', uiLang)}`
                : t('timer-free', uiLang)
            }
          />
          <Row
            label={strict ? t('rank-season-remaining', uiLang) : t('elapsed-time', uiLang)}
            value={
              <span className={expired ? 'text-rose-300' : strict && left <= 60_000 ? 'text-rose-300' : 'text-white/80'}>
                {expired ? t('time-over', uiLang) : formatClock(strict ? left : elapsedMs(setup))}
              </span>
            }
          />
        </dl>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onResume}
            disabled={expired}
            title={expired ? t('resume-expired', uiLang) : undefined}
            className="w-full rounded-xl bg-signal py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('resume-continue', uiLang)}
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full rounded-xl border border-white/15 py-3 text-sm font-medium text-white/70 transition hover:border-white/35 hover:text-white"
          >
            {t('resume-restart', uiLang)}
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-white/35">
          {expired ? t('resume-expired', uiLang) : t('resume-hint', uiLang)}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-white/40">{label}</dt>
      <dd className="font-mono text-white/80">{value}</dd>
    </div>
  );
}
