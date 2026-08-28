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
  /** 기본 제공 AI 사용 현황 — 회수 한도(차단 기준)와 토큰 내역(참고) */
  freeQuota?: {
    used: number;
    limit: number;
    resetAt: string | null;
    models: ModelUsage[];
    allowance: {
      aiSearch: { used: number; limit: number; remaining: number; resetAt: string | null };
      debateAiPerProblem: number;
      unlimited: boolean;
    };
  };
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
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">내장 면접관</p>
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
            <span className="block text-[11px] font-normal text-fg-muted">
              키 없이 바로 사용 · AI Search 하루 15회 · debateAI 문제당 10회
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] text-emerald-700">
            FREE
          </span>
        </label>

        {/* 모델별 사용량 — AI Search와 debateAI 탭에서 고른 모델을 기준으로 나눠 보여 준다 */}
        {provider === 'builtin_ai' && freeQuota && <FreeUsagePanel quota={freeQuota} />}
      </section>

      {/* ---------- 네이티브 API (BYOK → Pro Tier) ---------- */}
      <section>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">네이티브 API — Pro Tier</p>
          {initial.hasKey && (
            <span className="rounded-full border border-brand-300/60 bg-brand-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-signal">
              PRO 활성
            </span>
          )}
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-fg-muted">
          본인 API 키를 등록하면 ChatGPT · Claude · Gemini · Grok · Perplexity를 debateAI 탭과 면접·리팩토링에서
          쓸 수 있습니다. 요금은 등록한 키의 계정으로 청구됩니다.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {nativeProviders.map((p) => (
            <label
              key={p.key}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
                provider === p.key ? 'border-signal bg-brand-50/40 text-ink' : 'border-hairline hover:border-ink/30'
              }`}
            >
              <input
                type="radio"
                name="aiProvider"
                value={p.key}
                checked={provider === p.key}
                onChange={() => setProvider(p.key)}
                className="accent-[#4531d9]"
              />
              <span className="flex-1">
                {p.label}
                <span className="block font-mono text-[10px] font-normal text-fg-muted">{KEY_HINTS[p.key]}</span>
              </span>
            </label>
          ))}
        </div>

        {/* 키 입력 — 고른 제공사가 있을 때만. 값은 서버에서 이중 암호화되어 저장된다. */}
        {usingNative && (
          <div className="mt-3 rounded-xl border border-hairline bg-paper/40 p-4">
            <label htmlFor="aiApiKey" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              API KEY
            </label>
            <input
              id="aiApiKey"
              name="aiApiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={initial.hasKey ? '등록됨 — 바꿀 때만 입력' : KEY_HINTS[provider]}
              className="w-full rounded-lg border border-ink/15 bg-white px-4 py-2.5 font-mono text-sm placeholder:text-fg-quiet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-muted">
              <span>
                {initial.hasKey
                  ? `현재 등록된 키: ${initial.keyHint ?? '****'} · 비워 두고 저장하면 그대로 유지됩니다.`
                  : '키는 서버에서 AES-256-GCM으로 이중 암호화되어 저장되며, 이 화면으로 다시 내려오지 않습니다.'}
              </span>
              {KEY_CONSOLE_URLS[provider] && (
                <a
                  href={KEY_CONSOLE_URLS[provider]}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 font-medium text-brand-600 underline underline-offset-2"
                >
                  키 발급받기 →
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ---------- 내 컴퓨터에서 실행 (잠금) ---------- */}
      <section>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">내 컴퓨터에서 실행</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {lockedProviders.map((p) => (
            <div
              key={p.key}
              className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-hairline bg-paper/60 px-4 py-3 text-sm text-fg-quiet"
              title="아직 지원 준비 중입니다"
            >
              <input type="radio" disabled className="accent-[#4531d9]" />
              <span className="flex-1">{p.label}</span>
              <span className="shrink-0 rounded-full border border-hairline bg-white px-2 py-0.5 font-mono text-[10px] text-fg-muted">
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
            className="rounded-lg border border-ink/15 px-6 py-3 font-medium text-fg-secondary transition hover:border-ink/40 active:scale-[0.98] disabled:opacity-50"
          >
            {testPending ? '테스트 중…' : '연결 테스트'}
          </button>
        )}
        {showSkip && (
          <button formAction={skipAiOnboarding} className="px-6 py-3 font-medium text-fg-secondary transition-colors hover:text-ink-soft">
            나중에 하기 (건너뛰기)
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * 기본 제공 AI 사용 현황.
 *
 * 예전에는 "62,400 / 100,000 토큰" 하나만 보여 줬다. 그 숫자를 보고 다음 질문을 할지
 * 말지 정할 수 있는 사람은 없다 — 질문 하나가 몇 토큰인지 알 수 없기 때문이다.
 * 그래서 한도를 **횟수**로 바꿨고, 화면도 셀 수 있는 값을 먼저 보여 준다.
 * 토큰은 아래쪽 "모델별 내역"으로 내렸다 — 참고 정보이지 한도가 아니다.
 */
function FreeUsagePanel({ quota }: { quota: NonNullable<Props['freeQuota']> }) {
  const { allowance } = quota;
  const search = allowance.aiSearch;
  const searchPct = Math.min(100, (search.used / Math.max(1, search.limit)) * 100);
  const grouped = SURFACE_ORDER.map((surface) => ({
    surface,
    models: quota.models.filter((m) => m.surface === surface),
  })).filter((g) => g.models.length > 0);
  const topModelUsage = quota.models.reduce((max, m) => Math.max(max, m.used), 0);

  if (allowance.unlimited) {
    return (
      <div className="mt-2 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <p className="text-[12px] font-semibold text-emerald-900">사용 한도 없음</p>
        <p className="text-[11px] leading-relaxed text-emerald-900/70">
          내 API 키(또는 로컬 모델)가 등록되어 있어 AI Search·debateAI에 횟수 제한이 걸리지 않습니다.
          요금은 등록하신 키의 계정으로 청구됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-4 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
      <div>
        <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-brand-800/70">
          <span>AI Search · 오늘</span>
          <span>
            {search.used} / {search.limit}회
            {search.resetAt &&
              ` · ${new Date(search.resetAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })} 초기화`}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
          <div
            className={`h-full rounded-full ${search.remaining === 0 ? 'bg-rose-500' : 'bg-signal'}`}
            style={{ width: `${searchPct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-1.5 border-t border-brand-200/70 pt-3 text-[11px] text-brand-900/75">
        <p className="flex justify-between">
          <span>debateAI (문제 풀이 중 질문)</span>
          <span className="font-mono">문제당 하루 {allowance.debateAiPerProblem}회</span>
        </p>
        <p className="flex justify-between">
          <span>AI 면접관</span>
          <span className="font-mono">제한 없음</span>
        </p>
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
                  <span className={`truncate ${m.selected ? 'font-semibold text-ink' : 'text-fg-secondary'}`}>
                    {m.label}
                  </span>
                  {m.selected && (
                    <span className="shrink-0 rounded-full bg-signal/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-signal">
                      선택됨
                    </span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-muted">
                    {m.used.toLocaleString()} 토큰
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-brand-100">
                  {/* 가장 많이 쓴 모델을 100%로 둔다 — 토큰은 더 이상 한도가 아니므로
                      고정 분모로 그리면 막대가 전부 바닥에 붙어 비교가 안 된다 */}
                  <div
                    className="h-full rounded-full bg-signal/60"
                    style={{ width: `${Math.min(100, (m.used / Math.max(1, topModelUsage)) * 100)}%` }}
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
          횟수는 <strong>처음 사용한 시점부터 24시간</strong>이 지나면 다시 채워집니다.
        </li>
        <li>
          <strong>내 API 키를 등록하거나 로컬 모델을 연결하면 횟수 제한이 없습니다</strong> — 요금이 그 키의
          계정으로 청구되기 때문입니다.
        </li>
        <li>모델이 답하지 못한 요청은 횟수에서 다시 빼 드립니다.</li>
        <li>무료 제공 특성상 개인 API 키 연결 대비 응답 품질·속도가 떨어질 수 있습니다.</li>
      </ul>
    </div>
  );
}
