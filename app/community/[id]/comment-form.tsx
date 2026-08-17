'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createComment, type CommentFormState } from '@/app/lib/actions/comments';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

const initialState: CommentFormState = {};

interface Props {
  postId: string;
  parentId?: string;
  replyToName?: string; // 답글 대상 이름 — 컴포저 상단 칩으로 표시
  autoFocus?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
}

// 댓글/답글 컴포저 — 답글일 때는 대상 칩 + 취소 버튼이 붙는 컴팩트 카드.
// Ctrl(⌘)+Enter로 바로 등록할 수 있다.
export default function CommentForm({ postId, parentId, replyToName, autoFocus, onDone, onCancel }: Props) {
  const { language } = useLanguage();
  const [state, formAction, pending] = useActionState(createComment, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.errors) {
      formRef.current?.reset();
      onDone?.();
    }
    wasPending.current = pending;
  }, [pending, state, onDone]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={`rounded-2xl border bg-white p-3 ${parentId ? 'border-brand-200' : 'border-ink/10'}`}
    >
      <input type="hidden" name="postId" value={postId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}

      {parentId && (
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700">
          ↳ {replyToName ? `${replyToName}${t('reply-to-suffix', language)}` : t('reply-writing', language)}
        </p>
      )}

      <textarea
        ref={textareaRef}
        name="content"
        rows={parentId ? 2 : 3}
        required
        placeholder={t(parentId ? 'reply-placeholder' : 'comment-placeholder', language)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) formRef.current?.requestSubmit();
        }}
        className="w-full resize-y rounded-lg border-0 bg-transparent px-1 py-0.5 text-sm placeholder:text-ink-soft/35 focus:outline-none"
      />
      {state.errors?.content && <p className="text-xs text-rose-600">{state.errors.content[0]}</p>}
      {state.errors?.form && <p className="text-xs text-rose-600">{state.errors.form[0]}</p>}

      <div className="mt-1 flex items-center justify-between border-t border-ink/5 pt-2">
        <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] text-ink-soft/45">
          <input type="checkbox" name="anonymous" className="h-3.5 w-3.5 accent-[var(--color-signal)]" />
          {t('reply-anonymous', language)}
        </label>
        <span className="hidden font-mono text-[10px] text-ink-soft/35 sm:inline">{t('comment-hint', language)}</span>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-soft/50 hover:text-ink-soft"
            >
              {t('cancel', language)}
            </button>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
          >
            {pending ? t('comment-submitting', language) : t(parentId ? 'reply-submit' : 'comment-submit', language)}
          </button>
        </div>
      </div>
    </form>
  );
}
