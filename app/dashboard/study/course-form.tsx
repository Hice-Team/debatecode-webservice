'use client';

// 새 코스 추가 폼 — 학습자료 에디터 상단.
import { useActionState } from 'react';
import { createCourse, type CourseFormState } from '@/app/lib/actions/study-admin';

const initialState: CourseFormState = {};
const FIELD =
  'w-full rounded-lg border border-ink/15 bg-paper/50 px-3 py-2 text-sm placeholder:text-ink-soft/30 focus:outline-none focus:ring-2 focus:ring-signal/60';

export default function CourseForm() {
  const [state, formAction, pending] = useActionState(createCourse, initialState);

  return (
    <form action={formAction} className="rounded-xl border border-ink/10 bg-paper/40 p-4 space-y-3">
      <p className="font-mono text-xs text-ink-soft/60 tracking-wider">+ 새 코스 추가</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input name="title" required placeholder="코스 제목 (예: 파이썬 기초)" className={FIELD} />
        <input name="slug" required placeholder="slug (예: python-basics)" className={FIELD} />
        <select name="language" defaultValue="python" className={FIELD}>
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
        </select>
        <input name="order" type="number" defaultValue={0} min={0} title="정렬 순서" className={FIELD} />
      </div>
      <input name="description" required placeholder="코스 한 줄 설명" className={FIELD} />
      {state.errors && (
        <p className="text-xs text-rose-600">
          {Object.values(state.errors).flat()[0]}
        </p>
      )}
      {state.saved && <p className="text-xs text-emerald-600">코스가 추가되었습니다.</p>}
      <button type="submit" disabled={pending} className="dc-btn-primary text-xs px-4 py-2">
        {pending ? '추가 중…' : '코스 추가'}
      </button>
    </form>
  );
}
