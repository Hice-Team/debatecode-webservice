'use client';

// 공지 상단 고정 토글 — 글 화면에서 바로 켜고 끈다.
//
// 관리 콘솔까지 들어가야 고정할 수 있으면, 급한 공지를 올린 직후 화면을 옮겨야 한다.
// 고정은 글 하나에 대한 판단이므로 그 글을 보고 있는 자리에 두는 편이 맞다.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { togglePostPin } from '@/app/lib/actions/community';

const BUTTON = 'grid h-8 w-8 place-items-center rounded-lg border transition-colors';

export default function PinToggle({ postId, pinned }: { postId: string; pinned: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('postId', postId);
      const result = await togglePostPin(form);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const label = pinned ? '고정 해제' : '모든 게시판 상단에 고정';

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={label}
        aria-label={label}
        aria-pressed={pinned}
        className={`${BUTTON} ${
          pinned
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400'
            : 'border-hairline text-fg-muted hover:border-amber-300 hover:text-amber-700'
        } disabled:opacity-40`}
      >
        {/* 압정 */}
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden>
          <path d="M9 3h6l-1 5 3.5 3.5H6.5L10 8 9 3Z" strokeLinejoin="round" />
          <path d="M12 11.5V21" strokeLinecap="round" />
        </svg>
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-rose-600">
          {error}
        </span>
      )}
    </>
  );
}
