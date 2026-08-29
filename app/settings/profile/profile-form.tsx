'use client';

import { useActionState, useState } from 'react';
import { updateProfile, updateRankBadgeVisible, type ProfileFormState } from '@/app/lib/actions/profile';
import Avatar from '@/app/components/avatar';
import { useSettingsForm } from '../save-bar';

const initialState: ProfileFormState = {};

export default function ProfileForm({ initial }: { initial: { name: string; avatarUrl: string; rankBadgeVisible?: boolean; anonymousTag?: string | null } }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [preview, setPreview] = useState(initial.avatarUrl);
  const [badgeVisible, setBadgeVisible] = useState(initial.rankBadgeVisible ?? true);
  const anonymousTag = initial.anonymousTag;

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  }

  // 저장은 하단 바가 맡는다(app/settings/save-bar.tsx)
  const settingsForm = useSettingsForm();

  return (
    <form action={formAction} {...settingsForm} className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar src={preview || null} alt="아바타 미리보기" className="h-16 w-16 rounded-full border border-hairline" />
        <div>
          <label htmlFor="avatar" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">AVATAR</label>
          <input id="avatar" name="avatar" type="file" accept="image/*" onChange={handleAvatarChange} className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:text-white file:px-3 file:py-1.5 file:text-xs" />
        </div>
      </div>

      <div>
        <label htmlFor="name" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">NAME</label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={initial.name}
          required
          className="w-full rounded-lg border border-hairline bg-paper/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/60"
        />
        {state.errors?.name && <p className="mt-1.5 text-xs text-rose-600">{state.errors.name[0]}</p>}
      </div>

      {/* 랭크 배지 공개 — 글/답글의 배지와 명예의 전당 표시 이름이 함께 바뀐다 */}
      <fieldset className="rounded-lg border border-hairline bg-paper/50 px-4 py-3">
        <legend className="px-1 font-mono text-xs tracking-wider text-fg-secondary">RANK BADGE</legend>
        <p className="mb-2 text-xs text-fg-muted">
          커뮤니티 글과 답글에 내 등급 배지를 보여줄지 선택합니다.
        </p>

        {[
          {
            value: true,
            label: '공개',
            desc: '글·답글에 등급 배지가 표시되고, 명예의 전당에 내 이름으로 오릅니다.',
          },
          {
            value: false,
            label: '비공개',
            desc: `등급 배지를 숨깁니다. 명예의 전당에는 익명 식별자${anonymousTag ? ` (${anonymousTag})` : ''}로 표시됩니다.`,
          },
        ].map((option) => (
          <label
            key={String(option.value)}
            className={`mt-1.5 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
              badgeVisible === option.value ? 'border-signal bg-brand-50/60' : 'border-hairline hover:border-brand-200'
            }`}
          >
            <input
              type="radio"
              name="rankBadgeVisible"
              checked={badgeVisible === option.value}
              onChange={() => {
                setBadgeVisible(option.value);
                updateRankBadgeVisible(option.value);
              }}
              className="mt-0.5 h-4 w-4 accent-[var(--color-signal)]"
            />
            <span>
              <span className="font-medium text-fg">{option.label}</span>
              <span className="mt-0.5 block text-xs text-fg-muted">{option.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.errors?.form && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{state.errors.form[0]}</p>}
      {state.saved && <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">저장되었습니다.</p>}

      <button
        type="submit"
        disabled={pending}
        className="px-6 py-3 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-50"
      >
        {pending ? '저장 중…' : '저장'}
      </button>
    </form>
  );
}
