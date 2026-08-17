'use client';

// 강의(docs) 작성기 — 마크다운 툴바 포함. lessonId가 있으면 수정, 없으면 생성.
import { useActionState, useRef } from 'react';
import { saveLesson, type LessonFormState } from '@/app/lib/actions/study-admin';
import MarkdownToolbar from '@/app/community/write/markdown-toolbar';

const initialState: LessonFormState = {};
const LABEL = 'block font-mono text-xs text-ink-soft/60 tracking-wider mb-1.5';
const FIELD =
  'w-full rounded-lg border border-ink/15 bg-paper/50 px-4 py-2.5 text-sm placeholder:text-ink-soft/30 focus:outline-none focus:ring-2 focus:ring-signal/60';

export interface LessonInitial {
  id: number;
  title: string;
  slug: string;
  content: string;
  order: number;
}

export default function LessonForm({
  courseId,
  courseTitle,
  initial,
}: {
  courseId: number;
  courseTitle: string;
  initial?: LessonInitial;
}) {
  const [state, formAction, pending] = useActionState(saveLesson, initialState);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="courseId" value={courseId} />
      {initial && <input type="hidden" name="lessonId" value={initial.id} />}

      <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
        {courseTitle} — {initial ? '강의 수정' : '새 강의 작성'}
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <label htmlFor="title" className={LABEL}>TITLE — 강의 제목</label>
          <input id="title" name="title" required defaultValue={initial?.title} placeholder="변수와 자료형" className={FIELD} />
          {state.errors?.title && <p className="mt-1.5 text-xs text-rose-600">{state.errors.title[0]}</p>}
        </div>
        <div>
          <label htmlFor="order" className={LABEL}>ORDER</label>
          <input id="order" name="order" type="number" min={0} defaultValue={initial?.order ?? 0} className={FIELD} />
        </div>
      </div>

      <div>
        <label htmlFor="slug" className={LABEL}>SLUG</label>
        <input id="slug" name="slug" required defaultValue={initial?.slug} placeholder="variables-and-types" className={FIELD} />
        {state.errors?.slug && <p className="mt-1.5 text-xs text-rose-600">{state.errors.slug[0]}</p>}
      </div>

      <div>
        <label htmlFor="content" className={LABEL}>CONTENT — 강의 내용 (마크다운 + 코드 예제)</label>
        <MarkdownToolbar textareaRef={contentRef} />
        <textarea
          ref={contentRef}
          id="content"
          name="content"
          rows={18}
          required
          defaultValue={initial?.content}
          placeholder={'## 학습 목표\n\n- ...\n\n```python\nprint("hello debateCode")\n```'}
          className="w-full rounded-b-lg border border-ink/15 bg-paper/50 px-4 py-3 text-sm font-mono leading-relaxed placeholder:text-ink-soft/30 focus:outline-none focus:ring-2 focus:ring-signal/60"
        />
        {state.errors?.content && <p className="mt-1.5 text-xs text-rose-600">{state.errors.content[0]}</p>}
      </div>

      {state.errors?.form && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{state.errors.form[0]}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="px-6 py-3 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-50"
      >
        {pending ? '저장 중…' : initial ? '수정 저장하기' : '강의 등록하기'}
      </button>
    </form>
  );
}
