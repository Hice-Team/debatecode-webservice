'use client';

// 개인 맞춤 설정 — 남에게 보이는 나, 그리고 서비스가 나를 대하는 방식.
//
// 두 묶음으로 나눈다.
//   프로필  이름 · 이미지 · 공개 범위 · 등급 배지   (다른 사람이 보는 것)
//   학습    목표 · AI가 답할 언어                   (나만 쓰는 것)
// 예전에는 이름과 아바타만 있었고, 공개 범위 같은 것은 어디에도 없었다.
import { useActionState, useState, useTransition } from 'react';
import {
  resetProfileAppearance,
  updatePersonalSettings,
  updateProfile,
  updateRankBadgeVisible,
  type PersonalFormState,
  type ProfileFormState,
} from '@/app/lib/actions/profile';
import AvatarCropper from '@/app/components/avatar-cropper';
import Toggle from '@/app/components/toggle';
import { useSettingsForm } from '../save-bar';
import {
  CHAT_LANGUAGES,
  MAX_GOAL_LENGTH,
  PROFILE_VISIBILITY,
  type ChatLanguage,
  type ProfileVisibility,
} from '@/app/lib/user-prefs';

const profileInitial: ProfileFormState = {};
const personalInitial: PersonalFormState = {};

const INPUT =
  'w-full rounded-[var(--radius-card)] border border-hairline bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-quiet focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20';

function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-4">
      <h3 className="font-display text-[15px] font-bold tracking-tight text-fg">{title}</h3>
      {desc && <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">{desc}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  desc,
  htmlFor,
  children,
  stacked = false,
}: {
  label: string;
  desc?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      className={`border-b border-hairline py-4 last:border-b-0 ${
        stacked ? '' : 'flex flex-wrap items-center gap-x-6 gap-y-2'
      }`}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
        </label>
        {desc && <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">{desc}</p>}
      </div>
      <div className={stacked ? 'mt-3' : 'shrink-0'}>{children}</div>
    </div>
  );
}

export default function ProfileForm({
  initial,
}: {
  initial: {
    name: string;
    email: string;
    joinedAt: string;
    avatarUrl: string;
    rankBadgeVisible: boolean;
    anonymousTag?: string | null;
    goal: string;
    visibility: ProfileVisibility;
    chatLanguage: ChatLanguage;
  };
}) {
  const [state, formAction, pending] = useActionState(updateProfile, profileInitial);
  const [personalState, personalAction, personalPending] = useActionState(
    updatePersonalSettings,
    personalInitial,
  );
  const [resetting, startReset] = useTransition();

  const [badgeVisible, setBadgeVisible] = useState(initial.rankBadgeVisible);
  const [visibility, setVisibility] = useState<ProfileVisibility>(initial.visibility);
  const [goal, setGoal] = useState(initial.goal);

  // 하단 저장 바는 폼 하나만 맡는다 — 여기서는 이름·이미지 폼을 등록한다.
  // 아래 학습 폼은 항목이 셋뿐이라 자체 버튼으로 저장한다.
  const settingsForm = useSettingsForm();

  return (
    <div>
      <form action={formAction} {...settingsForm}>
        <Group title="프로필" desc="커뮤니티와 랭킹에서 다른 사람에게 보이는 정보입니다.">
          <Row label="프로필 이미지" stacked>
            <AvatarCropper
              name="avatar"
              initialUrl={initial.avatarUrl || null}
              onRemove={() => startReset(async () => void (await resetProfileAppearance()))}
            />
            {resetting && <p className="mt-2 font-mono text-[11px] text-fg-quiet">되돌리는 중…</p>}
          </Row>

          <Row label="이름" desc="2–20자. 커뮤니티 글과 랭킹에 표시됩니다." htmlFor="name" stacked>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={initial.name}
              required
              minLength={2}
              maxLength={20}
              className={INPUT}
            />
            {state.errors?.name && <p className="mt-1.5 text-[13px] text-rose-600">{state.errors.name[0]}</p>}
          </Row>

          <Row
            label="등급 배지 보이기"
            desc={
              badgeVisible
                ? '글·답글에 등급 배지가 표시되고, 명예의 전당에 내 이름으로 오릅니다.'
                : `등급 배지를 숨깁니다. 명예의 전당에는 익명 식별자${
                    initial.anonymousTag ? ` (${initial.anonymousTag})` : ''
                  }로 표시됩니다.`
            }
          >
            <Toggle
              label="등급 배지 보이기"
              checked={badgeVisible}
              disabled={visibility === 'private'}
              onChange={(v) => {
                setBadgeVisible(v);
                void updateRankBadgeVisible(v);
              }}
            />
          </Row>

          {state.errors?.form && (
            <p className="mt-4 rounded-[var(--radius-card)] border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
              {state.errors.form[0]}
            </p>
          )}
          {pending && <p className="mt-3 font-mono text-[11px] text-fg-quiet">저장 중…</p>}
        </Group>
      </form>

      {/* 가입 정보 — 읽기만 한다. 바꾸는 자리는 계정 및 보안이다. */}
      <Group title="가입 정보" desc="바꾸려면 계정 및 보안에서 진행합니다.">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-hairline py-4">
          <p className="min-w-0 flex-1 text-sm font-medium text-fg">이메일</p>
          <span className="shrink-0 text-sm text-fg-secondary" data-no-translate>
            {initial.email}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-hairline py-4 last:border-b-0">
          <p className="min-w-0 flex-1 text-sm font-medium text-fg">가입일</p>
          <span className="shrink-0 font-mono text-[13px] text-fg-secondary">{initial.joinedAt}</span>
        </div>
      </Group>

      <form action={personalAction}>
        <Group title="공개 범위" desc="내 프로필과 활동을 누가 볼 수 있는지 정합니다.">
          <fieldset className="py-2">
            <legend className="sr-only">프로필 공개 범위</legend>
            <div className="space-y-2">
              {PROFILE_VISIBILITY.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex min-h-[52px] cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border px-3.5 py-3 transition-colors ${
                    visibility === opt.id
                      ? 'border-signal bg-brand-50'
                      : 'border-hairline hover:border-fg-quiet'
                  }`}
                >
                  <input
                    type="radio"
                    name="profileVisibility"
                    value={opt.id}
                    checked={visibility === opt.id}
                    onChange={() => {
                      setVisibility(opt.id);
                      if (opt.id === 'private') setBadgeVisible(false);
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#4531d9]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{opt.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-muted">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </Group>

        <Group title="학습" desc="AI와 대시보드가 나를 어떻게 대할지 정합니다.">
          <Row
            label="지금의 목표"
            desc={`대시보드 맨 위에 걸립니다. 비워 두면 표시하지 않습니다. (${goal.length}/${MAX_GOAL_LENGTH}자)`}
            htmlFor="profileGoal"
            stacked
          >
            <input
              id="profileGoal"
              name="profileGoal"
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value.slice(0, MAX_GOAL_LENGTH))}
              maxLength={MAX_GOAL_LENGTH}
              placeholder="예: 한 달 안에 그래프 탐색 문제 20개 풀기"
              className={INPUT}
            />
            {personalState.errors?.goal && (
              <p className="mt-1.5 text-[13px] text-rose-600">{personalState.errors.goal[0]}</p>
            )}
          </Row>

          <Row label="AI가 답할 언어" desc="AI Search와 debateAI가 답하는 언어입니다." htmlFor="chatLanguage">
            <select
              id="chatLanguage"
              name="chatLanguage"
              defaultValue={initial.chatLanguage}
              className="rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2 text-sm text-fg focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20"
            >
              {CHAT_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Row>
        </Group>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={personalPending}
            className="dc-tap min-h-10 rounded-[var(--radius-card)] bg-signal px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
          >
            {personalPending ? '저장 중…' : '공개 범위 · 학습 저장'}
          </button>
          {personalState.saved && !personalPending && (
            <span className="text-[13px] text-emerald-700">저장했습니다.</span>
          )}
          {personalState.errors?.form && (
            <span className="text-[13px] text-rose-600">{personalState.errors.form[0]}</span>
          )}
        </div>
      </form>
    </div>
  );
}
