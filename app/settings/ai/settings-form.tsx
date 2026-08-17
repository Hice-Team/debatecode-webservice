'use client';

// AI 제공자 설정 — 고를 수 있는 길은 둘뿐이다.
//
//   DebateAI Free Tier  키 없이 바로. 어떤 모델을 얼마나 썼는지 여기서 확인한다.
//   네이티브 API        본인 키를 등록. 모델은 AI Search와 debateAI 탭의 셀렉터에서 고르므로
//                       이 화면은 키만 받는다.
//
// 규칙 기반 모델은 선택지에서 뺐다 — Free Tier 한도를 다 쓰면 자동으로 넘어가는 자리라
// 이용자가 직접 고를 일이 없다. 내 컴퓨터에서 실행은 자리만 남기고 잠가 둔다.
//
// 키는 이 화면으로 내려오지 않는다. 서버는 등록 여부와 가려진 힌트만 보내고, 입력칸을 비운 채
// 저장하면 기존 키를 그대로 둔다.
import { useActionState, useState } from 'react';
import {
  saveAiSettings,
  skipAiOnboarding,
  testAiConnection,
  type AiSettingsState,
  type AiTestState,
} from '@/app/lib/actions/settings';
import { AI_PROVIDERS, KEY_CONSOLE_URLS, KEY_HINTS, normalizeProvider } from '@/app/lib/ai/config';
import { FREE_AI_DAILY_LIMIT } from '@/app/lib/ai/free-ai-models';

const initialState: AiSettingsState = {};
const initialTestState: AiTestState = {};

/** 사용량 한 줄 — 모델 이름 · 쓴 토큰 · 전체 한도 대비 막대 */
export interface ModelUsage {
  id: string;
  label: string;
  /** 어디에서 고른 모델인가 — 사용량을 그 갈래로 묶어 보여 준다 */
  surface: 'debateai' | 'ai-search' | 'other';
  used: number;
  /** 지금 그 셀렉터에서 선택돼 있는 모델인지 */
  selected: boolean;
}

const SURFACE_LABEL: Record<ModelUsage['surface'], string> = {
  debateai: 'debateAI 탭 · 면접',
  'ai-search': 'AI Search',
  other: '그 외',
};

const SURFACE_ORDER: ModelUsage['surface'][] = ['debateai', 'ai-search', 'other'];

interface Props {
  initial: { aiProvider: string; hasKey: boolean; keyHint: string | null };
  /** Free Tier 사용량 — 총량과 모델별 내역 */
  freeQuota?: { used: number; limit: number; resetAt: string | null; models: ModelUsage[] };
  /** 온보딩 흐름에서만 전달 — 저장 성공 시 이 경로로 리다이렉트 */
  redirectTo?: string;
  /** 온보딩 흐름에서만 표시되는 "건너뛰기" 버튼 */
  showSkip?: boolean;
}

export default function AiSettingsForm({ initial, freeQuota, redirectTo, showSkip }: Props) {
  const [state, formAction, pending] = useActionState(saveAiSettings, initialState);
  const [testState, testAction, testPending] = useActionState(testAiConnection, initialTestState);
  const [provider, setProvider] = useState(() => normalizeProvider(initial.aiProvider));

  const nativeProviders = AI_PROVIDERS.filter((p) => p.group === 'native');
  const lockedProviders = AI_PROVIDERS.filter((p) => p.locked);
  const usingNative = nativeProviders.some((p) => p.key === provider);

  return (
    <form action={formAction} className="space-y-6">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      {/* ---------- 내장 면접관 ---------- */}
      <section>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-soft/50">내장 면접관</p>
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
            provider === 'builtin_ai' ? 'border-signal bg-signal/10 font-semibold' : 'border-ink/15 hover:border-ink/40'
          }`}
        >
          <input
            type="radio"
            name="aiProvider"
            value="builtin_ai"
            checked={provider === 'builtin_ai'}
            onChange={() => setProvider('builtin_ai')}
            className="accent-[#4531d9]"
          />
          <span className="flex-1">
            DebateAI Free Tier
            <span className="block text-[11px] font-normal text-ink-soft/55">
              키 없이 바로 사용 · 하루 {FREE_AI_DAILY_LIMIT.toLocaleString()} 토큰
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] text-emerald-700">
            FREE
          </span>
        </label>

        {/* 모델별 사용량 — AI Search와 debateAI 탭에서 고른 모델을 기준으로 나눠 보여 준다 */}
        {provider === 'builtin_ai' && freeQuota && <FreeUsagePanel quota={freeQuota} />}
      </section>

      {/* ---------- 네이티브 API (준비중으로 비활성화) ---------- */}
      <section>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-soft/50">네이티브 API</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {nativeProviders.map((p) => (
            <div
              key={p.key}
              className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-ink/10 bg-paper/60 px-4 py-3 text-sm text-ink-soft/40"
              title="아직 지원 준비 중입니다"
            >
              <input type="radio" disabled className="accent-[#4531d9]" />
              <span className="flex-1">
                {p.label}
                <span className="block font-mono text-[10px] font-normal text-ink-soft/45">{KEY_HINTS[p.key]}</span>
              </span>
              <span className="shrink-0 rounded-full border border-ink/10 bg-white px-2 py-0.5 font-mono text-[10px] text-ink-soft/50">준비중</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- 내 컴퓨터에서 실행 (잠금) ---------- */}
      <section>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-soft/50">내 컴퓨터에서 실행</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {lockedProviders.map((p) => (
            <div
              key={p.key}
              className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-ink/10 bg-paper/60 px-4 py-3 text-sm text-ink-soft/40"
              title="아직 지원 준비 중입니다"
            >
              <input type="radio" disabled className="accent-[#4531d9]" />
              <span className="flex-1">{p.label}</span>
              <span className="shrink-0 rounded-full border border-ink/10 bg-white px-2 py-0.5 font-mono text-[10px] text-ink-soft/50">
                준비중
              </span>
            </div>
          ))}
        </div>
      </section>

      {state.errors?.form && (
        <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">
          {state.errors.form.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      {state.saved && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-600">
          저장되었습니다.
        </p>
      )}
      {testState.message && (
        <p
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            testState.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
              : 'border-rose-200 bg-rose-50 text-rose-600'
          }`}
        >
          {testState.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || testPending}
          className="rounded-lg bg-signal px-6 py-3 font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? '저장 중…' : '설정 저장'}
        </button>
        {usingNative && (
          <button
            formAction={testAction}
            disabled={pending || testPending}
            className="rounded-lg border border-ink/15 px-6 py-3 font-medium text-ink-soft/70 transition hover:border-ink/40 active:scale-[0.98] disabled:opacity-50"
          >
            {testPending ? '테스트 중…' : '연결 테스트'}
          </button>
        )}
        {showSkip && (
          <button formAction={skipAiOnboarding} className="px-6 py-3 font-medium text-ink-soft/60 transition-colors hover:text-ink-soft">
            나중에 하기 (건너뛰기)
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Free Tier 사용량 — 총량 하나만 보여 주면 "무엇 때문에 다 썼는지"를 알 수 없다.
 * AI Search와 debateAI 탭에서 고른 모델을 축으로 나눠, 지금 선택된 모델을 표시해 준다.
 */
function FreeUsagePanel({ quota }: { quota: NonNullable<Props['freeQuota']> }) {
  const pct = Math.min(100, (quota.used / quota.limit) * 100);
  const grouped = SURFACE_ORDER.map((surface) => ({
    surface,
    models: quota.models.filter((m) => m.surface === surface),
  })).filter((g) => g.models.length > 0);

  return (
    <div className="mt-2 space-y-4 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
      <div>
        <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-brand-800/70">
          <span>오늘 사용량</span>
          <span>
            {quota.used.toLocaleString()} / {quota.limit.toLocaleString()} 토큰
            {quota.resetAt &&
              ` · ${new Date(quota.resetAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })} 초기화`}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
          <div
            className={`h-full rounded-full ${quota.used >= quota.limit ? 'bg-rose-500' : 'bg-signal'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {grouped.map((group) => (
        <div key={group.surface}>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-brand-700/70">
            {SURFACE_LABEL[group.surface]}
          </p>
          <ul className="space-y-1.5">
            {group.models.map((m) => (
              <li key={m.id}>
                <div className="flex items-baseline gap-2 text-[12px]">
                  <span className={`truncate ${m.selected ? 'font-semibold text-ink' : 'text-ink-soft/65'}`}>
                    {m.label}
                  </span>
                  {m.selected && (
                    <span className="shrink-0 rounded-full bg-signal/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-signal">
                      선택됨
                    </span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-soft/50">
                    {m.used.toLocaleString()} 토큰
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-brand-100">
                  <div
                    className="h-full rounded-full bg-signal/60"
                    style={{ width: `${Math.min(100, (m.used / quota.limit) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {quota.models.length === 0 && (
        <p className="text-[11px] text-brand-900/60">아직 사용 기록이 없습니다. 모델을 쓰기 시작하면 여기에 쌓입니다.</p>
      )}

      <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-brand-900/70">
        <li>
          한도를 모두 쓰면 초기화(사용 시점 기준 24시간 뒤)까지 <strong>규칙 기반 모델로 자동 전환</strong>됩니다.
        </li>
        <li>무료 제공 특성상 개인 API 키 연결 대비 응답 품질·속도가 떨어질 수 있습니다.</li>
      </ul>
    </div>
  );
}
