'use client';

import { useActionState, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { updatePost, type PostFormState } from '@/app/lib/actions/community';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import MarkdownToolbar from '../../write/markdown-toolbar';
import AttachmentComposer, { type AttachmentComposerHandle } from '../../write/attachment-composer';

const initialState: PostFormState = {};

export interface ExistingAttachment {
  id: string;
  kind: string;
  url: string | null;
  label: string | null;
}

const KIND_LABEL: Record<string, string> = {
  image: '이미지',
  file: '파일',
  link: '링크',
  youtube: '유튜브',
  code: '코드',
  poll: '투표',
};

const TITLE_MAX = 100;
const CONTENT_MAX = 10_000;

// 미리보기 본문 서식 — 글쓰기 폼과 같은 규칙을 쓴다
const PREVIEW =
  'min-h-[16rem] break-words px-4 py-4 text-[15px] leading-relaxed text-ink-soft/85 [&_p]:my-2 [&_p]:whitespace-pre-wrap [&_li]:whitespace-pre-wrap [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-ink [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-bold [&_h3]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-brand-300 [&_blockquote]:pl-3 [&_blockquote]:text-ink-soft/60 [&_code]:rounded [&_code]:bg-ink/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-ink/[0.04] [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-signal [&_a]:underline sm:px-5';

interface Props {
  postId: string;
  initialTitle: string;
  initialContent: string;
  attachments: ExistingAttachment[];
}

export default function EditForm({ postId, initialTitle, initialContent, attachments }: Props) {
  const { language } = useLanguage();
  const [state, formAction, pending] = useActionState(updatePost, initialState);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  // 글쓰기 폼과 같은 편집/미리보기 구조를 쓰므로 값도 같은 방식(제어)으로 다룬다
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<AttachmentComposerHandle>(null);

  const toggleRemove = (id: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="postId" value={postId} />
      {[...removed].map((id) => (
        <input key={id} type="hidden" name="removeAttachments" value={id} />
      ))}

      {/* 제목·본문·첨부는 한 편의 글이므로 테두리는 하나만 두고 안에서 실선으로 나눈다 */}
      <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
        <div className="px-4 pt-4 sm:px-5">
          <label htmlFor="title" className="sr-only">
            {t('post-title', language)}
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-0 bg-transparent p-0 pb-3 font-display text-xl font-bold tracking-tight text-ink focus:outline-none"
          />
          {state.errors?.title && <p className="pb-2 text-xs text-rose-600">{state.errors.title[0]}</p>}
        </div>

        <div className="flex items-center border-t border-ink/[0.07] px-3 py-1.5">
          <div className="ml-auto flex items-center gap-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setPreview(false)}
              aria-pressed={!preview}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                !preview ? 'font-semibold text-signal' : 'text-ink-soft/45 hover:text-ink'
              }`}
            >
              {t('write-tab-edit', language)}
            </button>
            <button
              type="button"
              onClick={() => setPreview(true)}
              aria-pressed={preview}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                preview ? 'font-semibold text-signal' : 'text-ink-soft/45 hover:text-ink'
              }`}
            >
              {t('write-tab-preview', language)}
            </button>
          </div>
        </div>

        {preview && (
          <div className={PREVIEW}>
            {content.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
              <p className="text-sm text-ink-soft/30">{t('write-preview-empty', language)}</p>
            )}
          </div>
        )}

        {/* textarea는 폼 값이므로 언마운트하지 않고 감춘다 */}
        <div className={preview ? 'hidden' : ''}>
          <MarkdownToolbar
            textareaRef={textareaRef}
            variant="flat"
            onChange={() => textareaRef.current && setContent(textareaRef.current.value)}
            onPickImage={() => composerRef.current?.pickImage()}
            onPickFile={() => composerRef.current?.pickFile()}
            onAddLink={() => composerRef.current?.addLink()}
            onAddYoutube={() => composerRef.current?.addYoutube()}
            onTogglePoll={() => composerRef.current?.togglePoll()}
          />
          <label htmlFor="content" className="sr-only">
            {t('post-content', language)}
          </label>
          <textarea
            ref={textareaRef}
            id="content"
            name="content"
            rows={16}
            required
            maxLength={CONTENT_MAX}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full resize-y border-0 bg-transparent px-4 py-3 font-mono text-sm leading-relaxed focus:outline-none focus:ring-0 sm:px-5"
          />
        </div>

        {/* 새 첨부 — 본문 바로 아래에 붙는다(글쓰기 폼과 같은 자리) */}
        <div className="px-4 pb-3 sm:px-5">
          <AttachmentComposer ref={composerRef} />
        </div>

        <div className="flex border-t border-ink/[0.07] px-4 py-1.5 sm:px-5">
          <span className={`ml-auto font-mono text-[10px] ${content.length >= CONTENT_MAX ? 'text-rose-500' : 'text-ink-soft/30'}`}>
            {content.length.toLocaleString()}/{CONTENT_MAX.toLocaleString()}
          </span>
        </div>
      </div>
      {state.errors?.content && <p className="text-xs text-rose-600">{state.errors.content[0]}</p>}

      {/* 기존 첨부 — 삭제/복원 토글. 저장 시 removeAttachments로 전송된다 */}
      {attachments.length > 0 && (
        <div>
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-soft/50">기존 첨부</p>
          <ul className="space-y-1">
            {attachments.map((a) => {
              const isRemoved = removed.has(a.id);
              return (
                <li key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/[0.03]">
                  <span className="shrink-0 rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-soft/45 ring-1 ring-inset ring-ink/10">
                    {KIND_LABEL[a.kind] ?? a.kind}
                  </span>
                  <span className={`truncate ${isRemoved ? 'text-ink-soft/30 line-through' : 'text-ink-soft/70'}`}>
                    {a.label || a.url || KIND_LABEL[a.kind] || a.kind}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleRemove(a.id)}
                    className={`ml-auto shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      isRemoved
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-ink-soft/40 hover:bg-rose-50 hover:text-rose-500'
                    }`}
                  >
                    {isRemoved ? '복원' : '삭제'}
                  </button>
                </li>
              );
            })}
          </ul>
          {removed.size > 0 && (
            <p className="mt-2 text-[11px] text-rose-500">저장하면 삭제 표시된 첨부 {removed.size}개가 제거됩니다.</p>
          )}
        </div>
      )}

      {state.errors?.form && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.errors.form[0]}</p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-signal px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-[0.99] disabled:opacity-50"
        >
          {pending ? '저장 중…' : '수정 완료'}
        </button>
      </div>
    </form>
  );
}
