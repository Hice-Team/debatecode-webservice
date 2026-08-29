'use client';

// 문제집 세트 생성/수정 폼 — useActionState로 서버 액션의 검증 결과를 그대로 표시한다.
import { useActionState } from 'react';
import { createProblemSet, updateProblemSet, type ProblemSetState } from '@/app/lib/actions/problem-sets';
import { SET_KINDS, SET_KIND_LABELS } from '@/app/lib/problem-sets';
import { DIFFICULTY_LABELS } from '@/app/lib/types';
import { BTN_PRIMARY } from '../ui';

interface SetValues {
  id: number;
  title: string;
  slug: string;
  kind: string;
  description: string;
  company: string | null;
  examYear: string | null;
  difficulty: number;
  timeLimitMin: number | null;
  order: number;
  published: boolean;
}

const FIELD = 'w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/25';
const LABEL = 'mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-fg-muted';

export default function ProblemSetForm({ mode, set }: { mode: 'create' | 'edit'; set?: SetValues }) {
  const action = mode === 'edit' ? updateProblemSet : createProblemSet;
  const [state, formAction, pending] = useActionState<ProblemSetState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {mode === 'edit' && set && <input type="hidden" name="id" value={set.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="set-title">
            제목
          </label>
          <input id="set-title" name="title" required maxLength={120} defaultValue={set?.title} className={FIELD} placeholder="2024 카카오 블라인드 1차" />
        </div>
        <div>
          <label className={LABEL} htmlFor="set-slug">
            slug (URL)
          </label>
          <input
            id="set-slug"
            name="slug"
            required
            maxLength={80}
            pattern="[a-z0-9\-]+"
            defaultValue={set?.slug}
            className={`${FIELD} font-mono`}
            placeholder="kakao-2024-blind-1"
          />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="set-description">
          설명
        </label>
        <textarea
          id="set-description"
          name="description"
          required
          rows={2}
          maxLength={1000}
          defaultValue={set?.description}
          className={FIELD}
          placeholder="세트 구성과 난이도를 한두 줄로 소개해 주세요."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <label className={LABEL} htmlFor="set-kind">
            유형
          </label>
          <select id="set-kind" name="kind" defaultValue={set?.kind ?? 'exam'} className={FIELD}>
            {SET_KINDS.map((k) => (
              <option key={k} value={k}>
                {SET_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="set-difficulty">
            난이도
          </label>
          <select id="set-difficulty" name="difficulty" defaultValue={set?.difficulty ?? 2} className={FIELD}>
            {[1, 2, 3, 4].map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="set-company">
            기업 (선택)
          </label>
          <input id="set-company" name="company" maxLength={60} defaultValue={set?.company ?? ''} className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="set-year">
            연도 (선택)
          </label>
          <input id="set-year" name="examYear" maxLength={10} defaultValue={set?.examYear ?? ''} className={FIELD} placeholder="2024" />
        </div>
        <div>
          <label className={LABEL} htmlFor="set-time">
            제한 시간(분)
          </label>
          <input
            id="set-time"
            name="timeLimitMin"
            type="number"
            min={0}
            max={600}
            defaultValue={set?.timeLimitMin ?? ''}
            className={FIELD}
            placeholder="0 = 무제한"
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="set-order">
            정렬 순서
          </label>
          <input id="set-order" name="order" type="number" min={0} max={9999} defaultValue={set?.order ?? 0} className={FIELD} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
          <input type="checkbox" name="published" defaultChecked={set?.published ?? false} className="h-4 w-4 accent-[var(--color-signal)]" />
          라이브러리에 공개
        </label>
        <button type="submit" disabled={pending} className={`${BTN_PRIMARY} ml-auto disabled:opacity-50`}>
          {pending ? '저장 중…' : mode === 'edit' ? '세트 저장' : '세트 만들기'}
        </button>
      </div>

      {state.errors?.form?.map((message) => (
        <p key={message} className="text-xs text-rose-600" role="alert">
          {message}
        </p>
      ))}
      {state.saved && <p className="text-xs font-semibold text-emerald-700">저장했습니다.</p>}
    </form>
  );
}
