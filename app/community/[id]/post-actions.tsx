'use client';

// 글 관리 — 수정·삭제. 신고 버튼과 나란히 놓이므로 같은 크기의 아이콘 버튼으로 통일한다.
// 글자 버튼이었을 때는 세 개가 제각각 넓이라 머리말이 어수선했다.
import Link from 'next/link';
import { deletePost } from '@/app/lib/actions/community';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

const BUTTON = 'grid h-8 w-8 place-items-center rounded-lg border transition-colors';

export default function PostActions({ postId, canEdit }: { postId: string; canEdit: boolean }) {
  const { language } = useLanguage();

  return (
    <>
      {canEdit && (
        <Link
          href={`/community/${postId}/edit`}
          title={t('post-edit', language)}
          aria-label={t('post-edit', language)}
          className={`${BUTTON} border-hairline text-fg-muted hover:border-brand-200 hover:text-brand-600`}
        >
          {/* 연필 */}
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden>
            <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" strokeLinejoin="round" />
          </svg>
        </Link>
      )}
      <form
        action={deletePost}
        onSubmit={(e) => {
          if (!confirm(t('post-delete-confirm', language))) e.preventDefault();
        }}
      >
        <input type="hidden" name="postId" value={postId} />
        <button
          type="submit"
          title={t('post-delete', language)}
          aria-label={t('post-delete', language)}
          className={`${BUTTON} border-hairline text-fg-muted hover:border-rose-200 hover:text-rose-600`}
        >
          {/* 휴지통 */}
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden>
            <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </>
  );
}
