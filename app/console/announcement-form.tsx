'use client';

// 전체 공지 작성 폼 — 등록 시 기존 활성 공지는 자동으로 내려간다.
import { useActionState } from 'react';
import { saveAnnouncement, type AnnouncementFormState } from '@/app/lib/actions/admin';

const initialState: AnnouncementFormState = {};
const FIELD =
  'w-full rounded-lg border border-ink/15 bg-paper/50 px-4 py-2.5 text-sm placeholder:text-ink-soft/30 focus:outline-none focus:ring-2 focus:ring-signal/60';

export default function AnnouncementForm() {
  const [state, formAction, pending] = useActionState(saveAnnouncement, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input name="title" required placeholder="공지 제목" className={FIELD} />
      {state.errors?.title && <p className="text-xs text-rose-600">{state.errors.title[0]}</p>}
      <textarea
        name="content"
        rows={3}
        required
        placeholder="공지 내용 — 모든 사용자에게 우하단 팝업으로 노출됩니다"
        className={`${FIELD}`}
      />
      {state.errors?.content && <p className="text-xs text-rose-600">{state.errors.content[0]}</p>}
      {state.errors?.form && <p className="text-xs text-rose-600">{state.errors.form[0]}</p>}
      {state.saved && <p className="text-xs text-emerald-600">공지가 게시되었습니다.</p>}
      <button type="submit" disabled={pending} className="dc-btn-primary text-xs px-4 py-2">
        {pending ? '게시 중…' : '📢 공지 게시'}
      </button>
    </form>
  );
}
