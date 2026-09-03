'use client';

// AI 개인 설정 — 기본 모델 2종 · 지침 · 맥락 양 · 대화 관리.
//
// 모델을 고르는 자리가 지금까지 흩어져 있었다. 일반 설정에 같은 셀렉터가 두 번 있었고,
// 여기로 모은다 — 무엇을 기본으로 쓸지는 한 곳에서만 정한다.
//
// 지침은 목록이다. 텍스트 상자 하나로 두면 "이 줄만 빼고 싶다"에 전체를 다시 쓰게 된다.
import { useActionState, useState } from 'react';
import { useSettingsForm } from '../save-bar';
import {
  DEFAULT_CODE_MODEL_ID,
  TIER_LABELS,
  findDebateAiModel,
  groupedModels,
} from '@/app/lib/ai/debateai-models';
import { saveAiPersonalization, type AiSettingsState } from '@/app/lib/actions/settings';
import {
  CONTEXT_MODES,
  DEFAULT_CONTEXT_MODE,
  MAX_INSTRUCTIONS,
  MAX_INSTRUCTION_LENGTH,
  type ContextMode,
} from '@/app/lib/user-prefs';

const initialState: AiSettingsState = {};

const SELECT =
  'w-full rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2.5 text-sm text-fg focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20';

function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h3 className="font-display text-[15px] font-bold tracking-tight text-fg">{title}</h3>
      {desc && <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">{desc}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function AiPersonalization({
  initial,
}: {
  initial: {
    codeModel: string;
    contextMode: ContextMode;
    instructions: string[];
  };
}) {
  const [state, formAction, pending] = useActionState(saveAiPersonalization, initialState);
  // 다른 설정 구역과 같은 하단 저장 바를 쓴다 — 구역마다 저장 방식이 다르면
  // "이건 어디서 저장하지"를 매번 다시 찾아야 한다
  const settingsForm = useSettingsForm({ result: state, pending });
  const [instructions, setInstructions] = useState<string[]>(initial.instructions);
  const [draft, setDraft] = useState('');
  const [context, setContext] = useState<ContextMode>(initial.contextMode);


  function addInstruction() {
    const value = draft.trim().slice(0, MAX_INSTRUCTION_LENGTH);
    if (!value || instructions.length >= MAX_INSTRUCTIONS) return;
    setInstructions((prev) => [...prev, value]);
    setDraft('');
  }

  return (
    <>
      <form action={formAction} {...settingsForm}>
        {/* ── 기본 모델 ─────────────────────────────────────────── */}
        <Group
          title="기본 모델"
          desc="화면을 열 때 처음 골라져 있을 모델입니다. 대화 중에 언제든 바꿀 수 있습니다."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="aiCodeModel" className="mb-1.5 block text-sm font-medium text-fg">
                면접 · 리팩토링
              </label>
              <select id="aiCodeModel" name="aiCodeModel" defaultValue={initial.codeModel} className={SELECT}>
                <option value="">기본값 — {findDebateAiModel(DEFAULT_CODE_MODEL_ID).label}</option>
                {groupedModels().map((group) => (
                  <optgroup key={group.tier} label={TIER_LABELS[group.tier]}>
                    {group.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} · {m.vendor}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
                이미 쓴 코드를 읽고 따지는 자리라 코드 특화 모델이 기본입니다.
              </p>
            </div>

          </div>
        </Group>

        {/* ── 지침 ──────────────────────────────────────────────── */}
        <Group
          title="AI에게 늘 전할 지침"
          desc={`대화가 시작될 때마다 앞에 붙습니다. 하나씩 추가하고 하나씩 뺄 수 있습니다. (${instructions.length}/${MAX_INSTRUCTIONS})`}
        >
          {instructions.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-hairline px-4 py-5 text-center text-[13px] text-fg-muted">
              아직 지침이 없습니다. 아래에 적어 추가해 보세요.
              <br />
              예: &ldquo;답을 바로 주지 말고 힌트부터 주세요&rdquo;
            </p>
          ) : (
            <ul className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] border border-hairline">
              {instructions.map((line, i) => (
                <li key={`${line}-${i}`} className="flex min-h-[52px] items-start gap-3 px-4 py-3">
                  <input type="hidden" name="instruction" value={line} />
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                  <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg">{line}</span>
                  <button
                    type="button"
                    onClick={() => setInstructions((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`지침 빼기: ${line}`}
                    className="dc-tap grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg-quiet transition-colors hover:bg-paper hover:text-rose-600"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden>
                      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_INSTRUCTION_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // 폼 전체가 제출되는 것을 막는다 — 이 입력칸의 Enter는 "한 줄 추가"다
                  e.preventDefault();
                  addInstruction();
                }
              }}
              disabled={instructions.length >= MAX_INSTRUCTIONS}
              placeholder="예: 코드보다 접근 방법을 먼저 설명해 주세요"
              aria-label="새 지침"
              className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-hairline bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-quiet focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={addInstruction}
              disabled={!draft.trim() || instructions.length >= MAX_INSTRUCTIONS}
              className="dc-tap min-h-10 shrink-0 rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-semibold text-fg-secondary transition-colors hover:border-fg-quiet hover:text-fg disabled:opacity-40"
            >
              추가
            </button>
          </div>
          {instructions.length >= MAX_INSTRUCTIONS && (
            <p className="mt-1.5 text-[12px] text-amber-700">
              지침은 {MAX_INSTRUCTIONS}개까지입니다. 더 넣으려면 먼저 하나를 빼 주세요.
            </p>
          )}
        </Group>

        {/* ── 맥락 양 ───────────────────────────────────────────── */}
        <Group
          title="함께 보낼 대화의 양"
          desc="지난 대화를 많이 실을수록 맥락은 잘 이어지지만 한도를 빨리 씁니다."
        >
          <div className="space-y-2">
            {CONTEXT_MODES.map((m) => (
              <label
                key={m.id}
                className={`flex min-h-[52px] cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border px-3.5 py-3 transition-colors ${
                  context === m.id ? 'border-signal bg-brand-50' : 'border-hairline hover:border-fg-quiet'
                }`}
              >
                <input
                  type="radio"
                  name="aiContextMode"
                  value={m.id}
                  checked={context === m.id}
                  onChange={() => setContext(m.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#4531d9]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-fg">{m.label}</span>
                    <span className="font-mono text-[11px] text-fg-muted">최근 {m.turns}개 대화</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-muted">{m.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {context !== DEFAULT_CONTEXT_MODE && (
            <p className="mt-2 text-[12px] text-fg-muted">
              기본값은 &ldquo;{CONTEXT_MODES.find((m) => m.id === DEFAULT_CONTEXT_MODE)?.label}&rdquo;입니다.
            </p>
          )}
        </Group>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="dc-tap min-h-10 rounded-[var(--radius-card)] bg-signal px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
          >
            {pending ? '저장 중…' : 'AI 설정 저장'}
          </button>
          {state.errors?.form && <span className="text-[13px] text-rose-600">{state.errors.form[0]}</span>}
        </div>
      </form>


    </>
  );
}
