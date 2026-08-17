'use client';

// 공지 목록 관리 — 활성 토글 / 삭제 / 인라인 수정.
import { useActionState, useState } from 'react';
import {
  toggleAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
  type AnnouncementFormState,
} from '@/app/lib/actions/admin';

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  active: boolean;
  createdAt: string;
}

const FIELD =
  'w-full rounded-lg border border-ink/15 bg-paper/40 px-3 py-2 text-sm placeholder:text-ink-soft/40 focus:outline-none focus:ring-2 focus:ring-signal/50';
const LINK = 'font-mono text-[11px] underline underline-offset-2';

function EditForm({ item, onDone }: { item: AnnouncementItem; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<AnnouncementFormState, FormData>(updateAnnouncement, {});
  if (state.saved) onDone();

  return (
    <form action={formAction} className="space-y-2 px-5 py-4">
      <input type="hidden" name="id" value={item.id} />
      <input name="title" defaultValue={item.title} required className={FIELD} />
      {state.errors?.title && <p className="text-xs text-rose-600">{state.errors.title[0]}</p>}
      <textarea name="content" defaultValue={item.content} rows={3} required className={`${FIELD}`} />
      {state.errors?.content && <p className="text-xs text-rose-600">{state.errors.content[0]}</p>}
      {state.errors?.form && <p className="text-xs text-rose-600">{state.errors.form[0]}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50">
          {pending ? '저장 중…' : '저장'}
        </button>
        <button type="button" onClick={onDone} className="rounded-xl border border-ink/15 px-3 py-1.5 text-xs text-ink-soft/70 hover:border-ink/40">취소</button>
      </div>
    </form>
  );
}

export default function AnnouncementManager({ items }: { items: AnnouncementItem[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (items.length === 0) {
    return <div className="rounded-2xl border border-ink/10 bg-white px-5 py-8 text-center text-sm text-ink-soft/55">공지가 없습니다.</div>;
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white divide-y divide-ink/5">
      {items.map((a) =>
        editingId === a.id ? (
          <EditForm key={a.id} item={a} onDone={() => setEditingId(null)} />
        ) : (
          <div key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span className={`shrink-0 font-mono text-[10px] px-2 py-0.5 rounded border ${a.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-paper text-ink-soft/50 border-ink/10'}`}>
              {a.active ? 'LIVE' : 'OFF'}
            </span>
            <span className="font-medium truncate">{a.title}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-soft/45">{new Date(a.createdAt).toLocaleDateString('ko-KR')}</span>
            <button type="button" onClick={() => setEditingId(a.id)} className={`${LINK} shrink-0 text-brand-600 hover:text-signal`}>수정</button>
            <form action={toggleAnnouncement} className="shrink-0">
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" className={`${LINK} text-ink-soft/70 hover:text-signal`}>{a.active ? '내리기' : '올리기'}</button>
            </form>
            <form action={deleteAnnouncement} className="shrink-0">
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" className={`${LINK} text-rose-600/80 hover:text-rose-700`}>삭제</button>
            </form>
          </div>
        ),
      )}
    </div>
  );
}
