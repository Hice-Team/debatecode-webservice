'use client';

// 제재 해제 — 사유를 받고 한 번 더 확인한다.
// 목록에서 [해제]가 곧바로 실행되면 옆 줄을 잘못 눌러 남의 제재를 푸는 일이 생긴다.
import { useState } from 'react';
import { liftSanctionAction } from '@/app/lib/actions/admin-access';
import { FOCUS } from '../../ui';

export default function LiftForm({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`shrink-0 rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink-soft/75 hover:border-emerald-300 hover:text-emerald-700 ${FOCUS}`}
      >
        해제
      </button>
    );
  }

  return (
    <form action={liftSanctionAction} className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
      <input type="hidden" name="id" value={id} />
      <input
        name="reason"
        required
        autoFocus
        aria-label={`${name} 제재 해제 사유`}
        placeholder="해제 사유 (예: 이의 인정 / 오탐)"
        className={`min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs placeholder:text-ink-soft/40 lg:w-56 lg:flex-none ${FOCUS}`}
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
      >
        해제 확정
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="shrink-0 rounded-xl border border-ink/15 px-3 py-1.5 text-xs text-ink-soft/60"
      >
        취소
      </button>
    </form>
  );
}
