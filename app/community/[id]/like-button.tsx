'use client';

import { useOptimistic, startTransition } from 'react';
import { togglePostLike } from '@/app/lib/actions/community';

interface Props {
  postId: string;
  likeCount: number;
  likedByMe: boolean;
  loggedIn: boolean;
}

export default function LikeButton({ postId, likeCount, likedByMe, loggedIn }: Props) {
  const [optimistic, setOptimistic] = useOptimistic(
    { count: likeCount, liked: likedByMe },
    (state) => ({ count: state.liked ? state.count - 1 : state.count + 1, liked: !state.liked }),
  );

  function handleClick() {
    const formData = new FormData();
    formData.set('postId', postId);
    startTransition(async () => {
      setOptimistic(undefined);
      await togglePostLike(formData);
    });
  }

  if (!loggedIn) {
    return (
      <span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink/10 px-4 text-sm text-ink-soft/45">
        <HeartIcon filled={false} />
        {likeCount}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={optimistic.liked}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition active:scale-[0.96] ${
        optimistic.liked
          ? 'border-rose-200 bg-rose-50 text-rose-600'
          : 'border-ink/15 bg-white text-ink-soft/60 hover:border-rose-200 hover:text-rose-500'
      }`}
    >
      <HeartIcon filled={optimistic.liked} />
      {optimistic.count}
    </button>
  );
}

/** 하트 — 채움 여부로만 상태를 나타내 크기가 흔들리지 않는다(문자 ♥/♡는 폭이 달랐다) */
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-[18px] w-[18px] stroke-current stroke-[1.7] ${filled ? 'fill-current' : 'fill-none'}`}
      aria-hidden
    >
      <path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7 2.7C19 15.6 12 20 12 20Z" strokeLinejoin="round" />
    </svg>
  );
}
