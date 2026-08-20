'use client';

// 댓글/답글 스레드 — 아바타·상대시간 헤더, 은은한 액션 로우(답글·수정·삭제·신고),
// 답글은 좌측 연결선이 있는 스레드로 들여쓰고 인라인 컴포저(자동 포커스)로 작성한다.
import { useActionState, useEffect, useRef, useState } from 'react';
import CommentForm from './comment-form';
import ReportButton from '@/app/components/report-button';
import AuthorBadges from '@/app/components/author-badges';
import { adoptAnswer } from '@/app/lib/actions/comments';
import { updateComment, deleteComment, type CommentFormState } from '@/app/lib/actions/comments';
import { useLanguage } from '@/app/context/language-context';
import { t, type Language } from '@/app/lib/i18n';

export interface CommentAuthor {
  name: string;
  anonymousTag?: string | null;
  role: string;
  starScore: number;
  rankBadgeVisible: boolean;
}

export interface CommentNode {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string | null;
  authorId: string;
  anonymous: boolean;
  author: CommentAuthor;
  replies: CommentNode[];
}

interface SectionProps {
  postId: string;
  comments: CommentNode[];
  currentUserId: string | null;
  isAdmin: boolean;
  /** 답글 작성 가능 여부 — 게시판 규칙(비밀글/인증 전용/채택 완료) 결과 */
  replyPermission: { allowed: boolean; reason?: string };
  /** 답변 채택 가능 여부 — 문의게시판 + 작성자 본인 + 미채택 */
  canAdopt: boolean;
  /** 이미 채택된 답글 id */
  adoptedCommentId: string | null;
}

// 상대 시간 — 1시간 이내는 분, 하루 이내는 시간, 그 외에는 날짜로 표기
function timeAgo(iso: string, lang: Language): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('comment-just-now', lang);
  if (min < 60) return `${min}${t('comment-min-ago', lang)}`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}${t('comment-hour-ago', lang)}`;
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'ko-KR');
}

// 이름 기반 아바타 색 — 같은 이름은 항상 같은 색
const AVATAR_COLORS = [
  'bg-brand-100 text-brand-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
];
function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      data-no-translate
      className={`grid shrink-0 place-items-center rounded-full font-bold ${avatarColor(name)} ${
        small ? 'h-7 w-7 text-[11px]' : 'h-8 w-8 text-xs'
      }`}
    >
      {(name[0] ?? '?').toUpperCase()}
    </span>
  );
}

const initialEditState: CommentFormState = {};

function EditCommentForm({ comment, onDone }: { comment: CommentNode; onDone: () => void }) {
  const { language } = useLanguage();
  const [state, formAction, pending] = useActionState(updateComment, initialEditState);
  const wasPending = useRef(false);

  // 저장 성공(pending 하강 에지 + 에러 없음) 시 편집 모드 종료
  useEffect(() => {
    if (wasPending.current && !pending && !state.errors) onDone();
    wasPending.current = pending;
  }, [pending, state, onDone]);

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="commentId" value={comment.id} />
      <textarea
        name="content"
        rows={2}
        required
        defaultValue={comment.content}
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal/60"
      />
      {state.errors?.content && <p className="text-xs text-rose-600">{state.errors.content[0]}</p>}
      {state.errors?.form && <p className="text-xs text-rose-600">{state.errors.form[0]}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-ink-soft">
          {t('cancel', language)}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {pending ? t('comment-saving', language) : t('save', language)}
        </button>
      </div>
    </form>
  );
}

function CommentItem({
  postId,
  node,
  currentUserId,
  isAdmin,
  depth,
  replyPermission,
  canAdopt,
  adoptedCommentId,
}: {
  postId: string;
  node: CommentNode;
  currentUserId: string | null;
  isAdmin: boolean;
  depth: number;
  replyPermission: { allowed: boolean; reason?: string };
  canAdopt: boolean;
  adoptedCommentId: string | null;
}) {
  const { language } = useLanguage();
  const [replying, setReplying] = useState(false);
  const [showAllReplies, setShowAllReplies] = useState(false);
  const [editing, setEditing] = useState(false);
  const isMine = currentUserId != null && node.authorId === currentUserId;
  const canDelete = isMine || isAdmin;

  return (
    <li>
      <div className="flex gap-2 py-1">
        <Avatar name={node.anonymous ? (node.author.anonymousTag ?? 'A') : node.author.name} small={depth > 0} />
        <div className="min-w-0 flex-1">
          {/* 헤더: 이름 · 상대시간 */}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <AuthorBadges author={node.author} anonymous={node.anonymous} className="[&>span:first-child]:font-semibold [&>span:first-child]:text-ink" />
            {adoptedCommentId === node.id && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                {t('adopted-answer', language)}
              </span>
            )}
            <span className="font-mono text-[11px] text-fg-quiet" title={new Date(node.createdAt).toLocaleString(language === 'en' ? 'en-US' : 'ko-KR')}>
              {timeAgo(node.createdAt, language)}
            </span>
            {node.updatedAt && <span className="font-mono text-[10px] text-fg-quiet">{t('comment-edited', language)}</span>}
          </p>

          {/* 본문 */}
          {editing ? (
            <EditCommentForm comment={node} onDone={() => setEditing(false)} />
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-fg">{node.content}</p>
          )}

          {/* 액션 로우 — 답글 · 수정 · 삭제 · 신고.
              모두 같은 크기의 글자 버튼으로 두고, 눌리는 영역만 배경으로 넓힌다 */}
          {!editing && (
            <div className="-ml-1 mt-1 flex flex-wrap items-center gap-1 text-[11px] font-medium text-fg-muted [&_button]:rounded-md [&_button]:px-1 [&_button]:py-0.5 [&_button]:transition-colors">
              {currentUserId && replyPermission.allowed && (
                <button type="button" onClick={() => setReplying((v) => !v)} className="text-brand-600/80 hover:bg-brand-50 hover:text-brand-600">
                  {replying ? t('comment-reply-cancel', language) : t('comment-reply', language)}
                </button>
              )}
              {/* 답변 채택 — 글 작성자가 자기 글의 다른 사람 답글 중 하나를 고른다 */}
              {canAdopt && depth === 0 && node.authorId !== currentUserId && (
                <form action={adoptAnswer} className="inline">
                  <input type="hidden" name="postId" value={postId} />
                  <input type="hidden" name="commentId" value={node.id} />
                  <button type="submit" className="font-semibold text-emerald-700 hover:bg-emerald-50">
                    {t('adopt-answer', language)}
                  </button>
                </form>
              )}
              {isMine && (
                <button type="button" onClick={() => setEditing(true)} className="hover:bg-ink/5 hover:text-ink-soft">
                  {t('comment-edit', language)}
                </button>
              )}
              {canDelete && (
                <form
                  action={deleteComment}
                  onSubmit={(e) => {
                    if (!confirm(t('comment-delete-confirm', language))) e.preventDefault();
                  }}
                  className="inline"
                >
                  <input type="hidden" name="commentId" value={node.id} />
                  <button type="submit" className="hover:bg-rose-50 hover:text-rose-600">{t('comment-delete', language)}</button>
                </form>
              )}
              {!isMine && currentUserId && <ReportButton targetType="comment" targetId={node.id} />}
              {node.replies.length > 0 && (
                <span className="ml-auto pr-1 font-mono text-[10px] text-fg-quiet">
                  {t('comment-replies-count', language)} {node.replies.length}
                </span>
              )}
            </div>
          )}

          {/* 인라인 답글 컴포저 */}
          {replying && (
            <div className="mt-2">
              <CommentForm
                postId={postId}
                parentId={node.id}
                replyToName={node.author.name}
                autoFocus
                onDone={() => setReplying(false)}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}

          {/* 답글 스레드 — 연결선과 함께 들여쓴다 */}
          {node.replies.length > 0 && (
            <div className="mt-3">
              <ul className="space-y-4 border-l-2 border-brand-100 pl-3 sm:pl-4">
                {(showAllReplies ? node.replies : node.replies.slice(0, 3)).map((reply) => (
                  <CommentItem
                    key={reply.id}
                    postId={postId}
                    node={reply}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    depth={depth + 1}
                    replyPermission={replyPermission}
                    canAdopt={canAdopt}
                    adoptedCommentId={adoptedCommentId}
                  />
                ))}
              </ul>

              {node.replies.length > 3 && (
                <div className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
                  <button
                    type="button"
                    onClick={() => setShowAllReplies((v) => !v)}
                    className="rounded-md px-2 py-1 text-sm font-medium text-brand-600 hover:bg-brand-50"
                  >
                    {showAllReplies ? t('comment-replies-collapse', language) : `${t('comment-replies-more', language)} ${node.replies.length - 3}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default function CommentSection({
  postId,
  comments,
  currentUserId,
  isAdmin,
  replyPermission,
  canAdopt,
  adoptedCommentId,
}: SectionProps) {
  const { language } = useLanguage();
  const total = countComments(comments);

  return (
    <div className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink">
        {t('comments', language)}
        <span className="rounded-full bg-brand-50 px-2 py-0.5 font-mono text-xs font-bold text-brand-700">{total}</span>
      </h2>

      {!currentUserId ? (
        <p className="border-t border-hairline pt-4 text-sm text-fg-quiet">
          {t('comment-login-required', language)}
        </p>
      ) : replyPermission.allowed ? (
        <CommentForm postId={postId} />
      ) : (
        <p className="border-l-2 border-ink/15 pl-3 text-sm text-fg-muted">
          {t(
            replyPermission.reason === 'adopted'
              ? 'reply-locked-adopted'
              : replyPermission.reason === 'admin-only'
                ? 'reply-admin-only'
                : 'reply-verified-only',
            language,
          )}
        </p>
      )}

      {comments.length > 0 ? (
        <ul className="mt-5 space-y-5 border-t border-hairline pt-5">
          {comments.map((node) => (
            <CommentItem
              key={node.id}
              postId={postId}
              node={node}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              depth={0}
              replyPermission={replyPermission}
              canAdopt={canAdopt}
              adoptedCommentId={adoptedCommentId}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-fg-quiet">{t('comment-empty', language)}</p>
      )}
    </div>
  );
}

function countComments(nodes: CommentNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countComments(n.replies), 0);
}
