'use client';

import { useActionState } from 'react';
import { updateAppSettings, type AppSettingsFormState } from '@/app/lib/actions/profile';
import { LANGUAGE_LABELS, type Language } from '@/app/lib/types';
import {
  DEFAULT_CODE_MODEL_ID,
  TIER_LABELS,
  findDebateAiModel,
  groupedModels,
} from '@/app/lib/ai/debateai-models';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import { useSettingsForm } from '../save-bar';

const initialState: AppSettingsFormState = {};

export default function AppSettingsForm({
  initial,
}: {
  initial: { emailNotifications: boolean; preferredLanguage: string; aiCodeModel: string };
}) {
  const [state, formAction, pending] = useActionState(updateAppSettings, initialState);
  const { language: uiLanguage, setLanguage: setUiLanguage } = useLanguage();

  // 저장은 하단 바가 맡는다(app/settings/save-bar.tsx)
  const settingsForm = useSettingsForm();

  return (
    <form action={formAction} {...settingsForm} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="checkbox" name="emailNotifications" defaultChecked={initial.emailNotifications} className="accent-[#4531d9]" />
          {t('settings-email-notifications', uiLanguage)}
        </label>

        {/* 앱 표시 언어 — 저장 버튼 없이 즉시 적용된다 (이 브라우저에 저장) */}
        <div>
          <label htmlFor="uiLanguage" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">
            {t('settings-app-language', uiLanguage)}
          </label>
          <select
            id="uiLanguage"
            value={uiLanguage}
            onChange={(e) => setUiLanguage(e.target.value as 'ko' | 'en')}
            className="w-full rounded-lg border border-hairline bg-paper/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/60"
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
          <p className="mt-1 text-xs text-fg-muted">{t('settings-language-note', uiLanguage)}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="preferredLanguage" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">
            DEFAULT CODE LANGUAGE
          </label>
          <select
            id="preferredLanguage"
            name="preferredLanguage"
            defaultValue={initial.preferredLanguage}
            className="w-full rounded-lg border border-hairline bg-paper/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/60"
          >
            <option value="">{t('settings-use-default', uiLanguage)}</option>
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l]}
              </option>
            ))}
          </select>
        </div>

        {/* 면접·리팩토링 기본 모델 */}
        <div>
          <label htmlFor="aiCodeModel" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
            면접 · 리팩토링 기본 모델
          </label>
          <select
            id="aiCodeModel"
            name="aiCodeModel"
            defaultValue={initial.aiCodeModel}
            className="w-full rounded-lg border border-hairline bg-paper/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/60"
          >
            <option value="">
              기본값 — {findDebateAiModel(DEFAULT_CODE_MODEL_ID).label}
            </option>
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
          <p className="mt-1 text-xs text-fg-muted">
            디베이트모드의 AI 면접관과 리팩토링모드가 이 모델을 씁니다. BYOK·Local 모델은 AI 제공자 설정에서 키 또는
            엔드포인트를 등록해야 동작합니다.
          </p>
        </div>
      </div>

      {/* 면접·리팩토링 모드의 기본 모델 — 두 모드 모두 "이미 쓰인 코드"를 읽고 따지는 일이라
          코드 특화 모델을 기본으로 둔다. 문제 풀이 중 질문(debateAI 탭)은 채팅바에서 따로 고른다. */}
      <div>
        <label htmlFor="aiCodeModel" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
          면접 · 리팩토링 기본 모델
        </label>
        <select
          id="aiCodeModel"
          name="aiCodeModel"
          defaultValue={initial.aiCodeModel}
          className="w-full rounded-lg border border-hairline bg-paper/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/60"
        >
          <option value="">
            기본값 — {findDebateAiModel(DEFAULT_CODE_MODEL_ID).label}
          </option>
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
        <p className="mt-1 text-xs text-fg-muted">
          디베이트모드의 AI 면접관과 리팩토링모드가 이 모델을 씁니다. BYOK·Local 모델은 AI 제공자 설정에서 키 또는
          엔드포인트를 등록해야 동작합니다.
        </p>
      </div>

      {state.errors?.form && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{state.errors.form[0]}</p>}
      {state.saved && <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">{t('saved', uiLanguage)}</p>}

      <button
        type="submit"
        disabled={pending}
        className="px-6 py-3 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-50"
      >
        {pending ? t('saving', uiLanguage) : t('save', uiLanguage)}
      </button>
    </form>
  );
}
