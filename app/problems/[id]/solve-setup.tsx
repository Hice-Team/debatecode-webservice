'use client';

// 풀이 시작 전 게이트 — 시간 규칙과 풀이 모드, 난이도를 한 화면에서 정하고 입장한다.
//
// 여기서 고른 조합은 풀이 중에 바꿀 수 없다. 그래서 "무엇이 어떻게 달라지는지"를
// 고르는 자리에서 전부 보여 주고, 되돌릴 수 없다는 사실도 입장 버튼 옆에 명시한다.
//
// 비로그인 이용자에게는 시그니처모드·보통 난이도만 열려 있다. 못 고르는 칸도 숨기지 않고
// 자물쇠와 함께 남겨 둔다 — 무엇이 잠겨 있는지 모른 채 지나가게 두지 않는다.
import { useState } from 'react';
import Link from 'next/link';
import {
  SCAFFOLD_DESCRIPTIONS,
  SCAFFOLD_LABELS,
  SCAFFOLD_LEVELS,
  type ScaffoldLevel,
} from '@/app/lib/scaffold';
import {
  STRICT_LIMIT_CHOICES,
  TIMER_MODES,
  WORKSPACE_MODES,
  allowedLevels,
  allowedModes,
  defaultSetup,
  type RefactorMode,
  type SolveSetup,
  type TimerMode,
  type WorkspaceMode,
} from '@/app/lib/solve-session';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

const TIMER_COPY: Record<TimerMode, { labelKey: string; descKey: string; icon: string }> = {
  free: { labelKey: 'timer-free', descKey: 'timer-free-desc', icon: '⏱' },
  strict: { labelKey: 'timer-strict', descKey: 'timer-strict-desc', icon: '⏳' },
};

const MODE_COPY: Record<WorkspaceMode, { labelKey: string; descKey: string }> = {
  signature: { labelKey: 'signature-mode', descKey: 'signature-mode-desc' },
  debate: { labelKey: 'debate-mode', descKey: 'debate-mode-desc' },
  refactor: { labelKey: 'refactor-mode', descKey: 'refactor-mode-desc' },
};

const REFACTOR_COPY: Record<RefactorMode, { label: string; descKey: string }> = {
  copilot: { label: 'Copilot', descKey: 'refactor-copilot-desc' },
  editor: { label: 'Editor', descKey: 'refactor-editor-desc' },
};

export default function SolveSetupGate({
  problemTitle,
  backHref,
  isLoggedIn,
  onStart,
}: {
  problemTitle: string;
  /** 돌아갈 곳 — 조건을 정하기 전에도 나갈 길은 열어 둔다 */
  backHref: string;
  isLoggedIn: boolean;
  /** 입장 — 버튼을 누른 시각이 곧 시계의 0초다 */
  onStart: (setup: SolveSetup) => void;
}) {
  const { language: uiLang } = useLanguage();
  const [draft, setDraft] = useState<Omit<SolveSetup, 'startedAt'>>(defaultSetup);

  const modes = allowedModes(isLoggedIn);
  const levels = allowedLevels(isLoggedIn);

  return (
    <div className="flex-grow overflow-y-auto dc-scroll bg-ink px-6 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header>
          <Link
            href={backHref}
            className="mb-3 inline-block text-[11px] text-fg-on-dark-quiet transition-colors hover:text-fg-on-dark-secondary"
          >
            ← {t('back', uiLang)}
          </Link>
          <p className="font-mono text-[11px] tracking-wider text-brand-300">실전 모의고사 설정</p>
          <h2 className="mt-1 text-2xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {t('setup-title', uiLang)}
          </h2>
          <p className="mt-1.5 text-sm text-fg-on-dark-muted">
            {problemTitle} — {t('setup-desc', uiLang)}
          </p>
        </header>

        {!isLoggedIn && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-brand-400/30 bg-signal/10 px-4 py-3 text-xs text-brand-100">
            <span className="font-semibold">🔒 {t('setup-guest-notice', uiLang)}</span>
            <Link href="/login" className="font-semibold text-white underline underline-offset-2">
              {t('login', uiLang)}
            </Link>
          </div>
        )}

        {/* ---------- 1. 시간 규칙 ---------- */}
        <section className="space-y-3">
          <SectionTitle step={1} title={t('setup-timer', uiLang)} />
          <div className="grid gap-3 sm:grid-cols-2">
            {TIMER_MODES.map((key) => (
              <ChoiceCard
                key={key}
                selected={draft.timerMode === key}
                onSelect={() => setDraft((prev) => ({ ...prev, timerMode: key }))}
                title={`${TIMER_COPY[key].icon} ${t(TIMER_COPY[key].labelKey, uiLang)}`}
                desc={t(TIMER_COPY[key].descKey, uiLang)}
              />
            ))}
          </div>

          {/* 제한 시간 — 엄격모드에서만 의미가 있어 고를 때만 펼친다 */}
          {draft.timerMode === 'strict' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="text-xs text-fg-on-dark-secondary">{t('setup-limit', uiLang)}</span>
              {STRICT_LIMIT_CHOICES.map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, limitMinutes: min }))}
                  aria-pressed={draft.limitMinutes === min}
                  className={`rounded-lg px-3 py-1 text-[11px] font-semibold transition-colors ${
                    draft.limitMinutes === min
                      ? 'bg-signal text-white'
                      : 'border border-white/15 text-fg-on-dark-muted hover:border-white/35 hover:text-white'
                  }`}
                >
                  {min}
                  {t('minutes-short', uiLang)}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ---------- 2. 풀이 모드 ---------- */}
        <section className="space-y-3">
          <SectionTitle step={2} title={t('setup-mode', uiLang)} />
          <div className="grid gap-3 sm:grid-cols-3">
            {WORKSPACE_MODES.map((key) => {
              const locked = !modes.includes(key);
              return (
                <ChoiceCard
                  key={key}
                  selected={draft.mode === key}
                  locked={locked}
                  lockHint={t('setup-login-required', uiLang)}
                  onSelect={() => setDraft((prev) => ({ ...prev, mode: key }))}
                  title={t(MODE_COPY[key].labelKey, uiLang)}
                  desc={t(MODE_COPY[key].descKey, uiLang)}
                />
              );
            })}
          </div>

          {/* 리팩토링 세부 모드 — 이것도 풀이 중에는 바꿀 수 없어 여기서 정한다 */}
          {draft.mode === 'refactor' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(REFACTOR_COPY) as RefactorMode[]).map((key) => (
                <ChoiceCard
                  key={key}
                  compact
                  selected={draft.refactorMode === key}
                  onSelect={() => setDraft((prev) => ({ ...prev, refactorMode: key }))}
                  title={REFACTOR_COPY[key].label}
                  desc={t(REFACTOR_COPY[key].descKey, uiLang)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ---------- 3. 난이도 ----------
            리팩토링은 AI가 준 결함 코드에서 출발해 시작 코드 난이도 개념이 없다. */}
        {draft.mode !== 'refactor' && (
          <section className="space-y-3">
            <SectionTitle step={3} title={t('setup-level', uiLang)} />
            <div className="grid gap-3 sm:grid-cols-3">
              {SCAFFOLD_LEVELS.map((level: ScaffoldLevel) => {
                const locked = !levels.includes(level);
                return (
                  <ChoiceCard
                    key={level}
                    selected={draft.level === level}
                    locked={locked}
                    lockHint={t('setup-login-required', uiLang)}
                    onSelect={() => setDraft((prev) => ({ ...prev, level }))}
                    title={SCAFFOLD_LABELS[level]}
                    desc={SCAFFOLD_DESCRIPTIONS[level]}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* ---------- 입장 ---------- */}
        <div className="space-y-2 border-t border-white/10 pt-5">
          <p className="text-[11px] leading-relaxed text-amber-200/80">⚠ {t('setup-lock-warning', uiLang)}</p>
          <button
            type="button"
            onClick={() => onStart({ ...draft, startedAt: Date.now() })}
            className="w-full rounded-xl bg-signal py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 active:scale-[0.995]"
          >
            {t('setup-start', uiLang)}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white/10 font-mono text-[10px] text-fg-on-dark-secondary">
        {step}
      </span>
      <h3 className="text-sm font-bold text-white">{title}</h3>
    </div>
  );
}

function ChoiceCard({
  title,
  desc,
  selected,
  locked = false,
  lockHint,
  compact = false,
  onSelect,
}: {
  title: string;
  desc: string;
  selected: boolean;
  locked?: boolean;
  lockHint?: string;
  compact?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={locked}
      aria-pressed={selected}
      title={locked ? lockHint : undefined}
      onClick={onSelect}
      className={`rounded-xl border text-left transition-colors ${compact ? 'p-3' : 'p-4'} ${
        locked
          ? 'cursor-not-allowed border-white/10 bg-white/[0.02] opacity-45'
          : selected
            ? 'border-signal bg-signal/10'
            : 'border-white/15 hover:border-white/35'
      }`}
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
        {title}
        {locked && <span className="text-[10px]">🔒</span>}
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-fg-on-dark-muted">{locked && lockHint ? lockHint : desc}</p>
    </button>
  );
}
