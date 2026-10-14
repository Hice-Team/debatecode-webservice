'use client';

// 글쓰기 폼 — 좌: 편집기(제목 · 본문 · 첨부), 우: 게시 설정과 등록 버튼.
//
// 예전 구조는 모든 항목이 한 줄로 쌓여 있어 본문이 화면 아래로 밀렸다. 글쓰기에서 가장 오래
// 머무는 곳은 본문이므로 본문에 세로 공간을 몰아주고, 게시판·공개 설정처럼 한 번 정하고 마는
// 것들은 옆으로 뺐다(좁은 화면에서는 다시 아래로 쌓인다).
//
// 새로 붙인 것: 마크다운 미리보기 · 임시저장 복원 · 글자 수 표시.
import { useActionState, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createPost, type PostFormState } from '@/app/lib/actions/community';
import { BOARDS, SNS_PLATFORMS, boardDesc } from '../boards';
import { CONDITIONS, CONDITION_LABELS } from '@/app/lib/market';
import {
  BOUNTY_DEFAULT,
  BOUNTY_MAX,
  BOUNTY_MIN,
  canWriteToBoard,
  supportsBounty,
  supportsPinning,
  supportsSecret,
  supportsVerifiedOnly,
} from '@/app/lib/board-rules';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import MarkdownToolbar from './markdown-toolbar';
import AttachmentComposer, { type AttachmentComposerHandle } from './attachment-composer';

const initialState: PostFormState = {};

const TITLE_MAX = 100;
const CONTENT_MAX = 10_000;

const LABEL = 'block font-mono text-[11px] uppercase tracking-wider text-fg-muted mb-1.5';
// 미리보기 본문 서식 — 수정 폼과 같은 규칙
const PREVIEW =
  'min-h-[18rem] break-words px-4 py-4 text-[15px] leading-relaxed text-fg [&_p]:my-2 [&_p]:whitespace-pre-wrap [&_li]:whitespace-pre-wrap [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-fg [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-fg [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-bold [&_h3]:text-fg [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-brand-300 [&_blockquote]:pl-3 [&_blockquote]:text-fg-secondary [&_code]:rounded [&_code]:bg-paper [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-paper [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-signal [&_a]:underline sm:px-5';

const FIELD =
  'w-full rounded-lg border border-hairline bg-surface px-3.5 py-2.5 text-sm placeholder:text-fg-quiet focus:outline-none focus:border-signal/40 focus:ring-2 focus:ring-signal/40';

/** 임시저장 — 작성 중 이탈해도 제목·본문이 남는다. 등록에 성공하면 지운다. */
const DRAFT_KEY = 'dc:community:draft';

interface Draft {
  board: string;
  title: string;
  content: string;
  savedAt: number;
}

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed.title?.trim() && !parsed.content?.trim()) return null;
    return {
      board: typeof parsed.board === 'string' ? parsed.board : 'free',
      title: parsed.title ?? '',
      content: parsed.content ?? '',
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export default function WriteForm({ initialBoard, role }: { initialBoard: string; role: string }) {
  const [state, formAction, pending] = useActionState(createPost, initialState);
  const [board, setBoard] = useState(initialBoard);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  // 복원 제안 — 띄워 두고 이용자가 고르게 한다. 말없이 덮어쓰면 방금 쓰던 글을 잃는다.
  const [draft, setDraft] = useState<Draft | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<AttachmentComposerHandle>(null);
  const { language } = useLanguage();

  const isSns = board === 'sns';
  const canSecret = supportsSecret(board); // 문의게시판 — 비밀글 선택
  const canBounty = supportsBounty(board); // 문의게시판 — 채택 포인트
  const isMarket = board === 'market'; // 중고게시판 — 매물 정보
  const isNotice = board === 'notice'; // 공지사항 — 익명 불가
  // 택배 여부에 따라 택배비 칸을 열고 닫는다
  const [shipping, setShipping] = useState(false);
  const canVerifiedOnly = supportsVerifiedOnly(board); // 멘토게시판 — 인증 답변 전용 옵션
  // 쓸 수 없는 게시판은 목록에서 아예 뺀다 — 고르고 나서 거절당하는 것보다 낫다
  const writableBoards = BOARDS.filter((b) => canWriteToBoard(b.key, role));
  const canPin = supportsPinning(board); // 공지사항 — 모든 게시판 상단 고정 옵션

  // 저장된 임시글 확인 — localStorage는 하이드레이션 후에만 읽을 수 있다
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 접근 가능
    setDraft(readDraft());
  }, []);

  // 작성 중 자동 저장 — 타이핑마다 쓰지 않고 잠시 멈췄을 때만 기록한다
  useEffect(() => {
    if (!title.trim() && !content.trim()) return;
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ board, title, content, savedAt: Date.now() }));
      } catch {
        // 저장 실패는 작성 자체를 막지 않는다
      }
    }, 800);
    return () => window.clearTimeout(id);
  }, [board, title, content]);

  function restoreDraft() {
    if (!draft) return;
    setBoard(draft.board);
    setTitle(draft.title);
    setContent(draft.content);
    setDraft(null);
  }

  function discardDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setDraft(null);
  }

  // 툴바는 textarea.value를 직접 조작한다 — 제어 상태와 어긋나지 않게 다시 읽어 온다
  function syncFromTextarea() {
    if (textareaRef.current) setContent(textareaRef.current.value);
  }

  return (
    <form
      action={(formData) => {
        // 등록에 성공하면 서버 액션이 리다이렉트하므로 여기서 임시저장을 비운다
        discardDraft();
        return formAction(formData);
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start lg:gap-8"
    >
      {/* ==================== 좌: 편집기 ====================
           제목·본문·첨부는 한 편의 글이므로 테두리도 하나만 두고 안에서 실선으로만 나눈다. */}
      <div className="min-w-0">
        {/* 임시저장 복원 — 이번 세션에서 쓰던 글이 남아 있을 때만 */}
        {draft && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-amber-400 pl-3 text-xs text-amber-900">
            <span className="font-semibold">
              {t('draft-found', language)} ({new Date(draft.savedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })})
            </span>
            <span className="min-w-0 flex-1 truncate text-amber-800/60">{draft.title || draft.content}</span>
            <button type="button" onClick={restoreDraft} className="shrink-0 font-semibold text-amber-700 hover:underline">
              {t('draft-restore', language)}
            </button>
            <button type="button" onClick={discardDraft} className="shrink-0 text-amber-700/70 hover:underline">
              {t('draft-discard', language)}
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
          {/* 제목 */}
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
              placeholder={t('post-title-placeholder', language)}
              className="w-full border-0 bg-transparent p-0 pb-3 font-display text-xl font-bold tracking-tight text-fg placeholder:font-normal placeholder:text-fg-quiet focus:outline-none"
            />
            {state.errors?.title && <p className="pb-2 text-xs text-rose-600">{state.errors.title[0]}</p>}
          </div>

          {/* SNS 게시판 — 외부 링크가 본체라 본문보다 먼저 받는다 */}
          {isSns && (
            <div className="grid gap-3 border-t border-hairline px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:px-5">
              <div>
                <label htmlFor="snsPlatform" className={LABEL}>
                  Platform
                </label>
                <select id="snsPlatform" name="snsPlatform" defaultValue="velog" className={FIELD}>
                  {SNS_PLATFORMS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor="url" className={LABEL}>
                  URL
                </label>
                <input id="url" name="url" type="text" placeholder="https://velog.io/@me/my-post" className={FIELD} />
                {state.errors?.url && <p className="mt-1.5 text-xs text-rose-600">{state.errors.url[0]}</p>}
              </div>
            </div>
          )}

          {/* 본문 — 편집/미리보기 전환. 마크다운으로 저장되므로 올린 그대로가 미리보기다 */}
          {!isSns && (
            <div className="flex items-center border-t border-hairline px-3 py-1.5">
              <div className="ml-auto flex items-center gap-0.5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setPreview(false)}
                  aria-pressed={!preview}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    !preview ? 'font-semibold text-signal' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {t('write-tab-edit', language)}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(true)}
                  aria-pressed={preview}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    preview ? 'font-semibold text-signal' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {t('write-tab-preview', language)}
                </button>
              </div>
            </div>
          )}

          {preview && !isSns && (
            <div className={PREVIEW}>
              {content.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <p className="text-sm text-fg-quiet">{t('write-preview-empty', language)}</p>
              )}
            </div>
          )}

          {/* textarea는 폼 값이므로 언마운트하지 않고 감춘다 */}
          <div className={preview && !isSns ? 'hidden' : ''}>
            {!isSns && (
              <MarkdownToolbar
                textareaRef={textareaRef}
                variant="flat"
                onChange={syncFromTextarea}
                onPickImage={() => composerRef.current?.pickImage()}
                onPickFile={() => composerRef.current?.pickFile()}
                onAddLink={() => composerRef.current?.addLink()}
                onAddYoutube={() => composerRef.current?.addYoutube()}
                onTogglePoll={() => composerRef.current?.togglePoll()}
              />
            )}
            <label htmlFor="content" className="sr-only">
              {isSns ? t('post-intro', language) : t('post-content', language)}
            </label>
            <textarea
              ref={textareaRef}
              id="content"
              name="content"
              rows={isSns ? 3 : 16}
              required
              maxLength={CONTENT_MAX}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={isSns ? t('post-intro-placeholder', language) : t('post-content-placeholder', language)}
              className={`w-full resize-y border-0 bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-fg-quiet focus:outline-none focus:ring-0 sm:px-5 ${
                isSns ? '' : 'font-mono'
              }`}
            />
          </div>

          {/* 첨부 목록 — 툴바에서 넣은 이미지·파일·링크·투표가 본문 바로 아래 이어 붙는다 */}
          {!isSns && (
            <div className="px-4 pb-3 sm:px-5">
              <AttachmentComposer ref={composerRef} />
            </div>
          )}

          <div className="flex border-t border-hairline px-4 py-1.5 sm:px-5">
            <span className={`ml-auto font-mono text-[10px] ${content.length >= CONTENT_MAX ? 'text-rose-500' : 'text-fg-quiet'}`}>
              {content.length.toLocaleString()}/{CONTENT_MAX.toLocaleString()}
            </span>
          </div>
        </div>
        {state.errors?.content && <p className="mt-1.5 text-xs text-rose-600">{state.errors.content[0]}</p>}
      </div>

      {/* ==================== 우: 게시 설정 ====================
           한 번 정하고 마는 값들이라 별도 상자로 띄우지 않고 여백으로만 구분한다. */}
      <aside className="space-y-5 border-t border-hairline pt-5 lg:sticky lg:top-6 lg:border-t-0 lg:pt-0">
        <div>
          <label htmlFor="board" className={LABEL}>
            {t('board', language)}
          </label>
          <select id="board" name="board" value={board} onChange={(e) => setBoard(e.target.value)} className={FIELD}>
            {writableBoards.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">{boardDesc(board)}</p>
        </div>

        {/* 중고 매물 — 가격과 거래 방법이 없으면 글이 아니라 그냥 사진이다.
            그래서 옵션이 아니라 본 입력으로 올려 둔다. */}
        {isMarket && (
          <div className="space-y-3 rounded-[var(--radius-panel)] border border-hairline bg-paper/50 p-4">
            <p className={LABEL}>거래 정보</p>

            <div>
              <label htmlFor="price" className="block text-sm text-fg-secondary">
                판매 가격
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="price"
                  name="price"
                  inputMode="numeric"
                  placeholder="0"
                  className={`${FIELD} dc-num`}
                />
                <span className="shrink-0 text-sm text-fg-muted">원</span>
              </div>
              <p className="mt-1 text-[11px] text-fg-muted">0을 넣으면 나눔으로 표시됩니다.</p>
              {state.errors?.price && <p className="mt-1 text-xs text-rose-600">{state.errors.price[0]}</p>}
            </div>

            <div>
              <label htmlFor="condition" className="block text-sm text-fg-secondary">
                상품 상태
              </label>
              <select id="condition" name="condition" defaultValue="used" className={`${FIELD} mt-1.5`}>
                {CONDITIONS.map((key) => (
                  <option key={key} value={key}>
                    {CONDITION_LABELS[key]}
                  </option>
                ))}
              </select>
              <input
                name="conditionNote"
                placeholder="예: 모서리 찍힘, 필기 약간 있음"
                maxLength={300}
                className={`${FIELD} mt-2`}
              />
            </div>

            <div>
              <label htmlFor="region" className="block text-sm text-fg-secondary">
                직거래 희망 장소
              </label>
              <input
                id="region"
                name="region"
                placeholder="예: 서울 성북구 안암동"
                maxLength={60}
                className={`${FIELD} mt-1.5`}
              />
              {state.errors?.region && <p className="mt-1 text-xs text-rose-600">{state.errors.region[0]}</p>}
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg-secondary">
              <input
                type="checkbox"
                name="shipping"
                checked={shipping}
                onChange={(e) => setShipping(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-signal)]"
              />
              택배 거래도 가능
            </label>

            {shipping && (
              <div>
                <label htmlFor="shippingFee" className="block text-sm text-fg-secondary">
                  택배비
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="shippingFee"
                    name="shippingFee"
                    inputMode="numeric"
                    placeholder="3000"
                    className={`${FIELD} dc-num`}
                  />
                  <span className="shrink-0 text-sm text-fg-muted">원</span>
                </div>
                <p className="mt-1 text-[11px] text-fg-muted">비워 두면 &apos;착불 또는 협의&apos;로 표시됩니다.</p>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-fg-muted">
              중고 거래는 이메일 인증을 마친 계정만 등록할 수 있습니다. 거래 전 상대의 계좌·연락처를
              더치트에서 조회해 보시길 권합니다.
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          <p className={LABEL}>{t('post-options', language)}</p>

          {canBounty && (
            <div>
              <label htmlFor="bounty" className="block text-sm text-fg">
                채택 포인트
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="bounty"
                  name="bounty"
                  type="number"
                  min={BOUNTY_MIN}
                  max={BOUNTY_MAX}
                  step={5}
                  defaultValue={BOUNTY_DEFAULT}
                  className={`${FIELD} w-24`}
                />
                <span className="font-mono text-xs text-fg-muted">
                  P ({BOUNTY_MIN}~{BOUNTY_MAX})
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                답변을 채택하면 답변자에게 지급됩니다. 운영진·협력사가 채택된 경우에는 지급되지 않습니다.
              </p>
            </div>
          )}

          {canSecret && (
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg">
              <input type="checkbox" name="secret" className="mt-0.5 h-4 w-4 accent-[var(--color-signal)]" />
              <span>
                비밀글로 작성
                <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">
                  나와 운영진만 볼 수 있고, 답글도 운영진만 달 수 있습니다.
                </span>
              </span>
            </label>
          )}

          {canPin && (
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg">
              <input type="checkbox" name="pinned" className="mt-0.5 h-4 w-4 accent-[var(--color-signal)]" />
              <span>
                공지사항으로 등록
                <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">
                  모든 게시판 목록 맨 위에 고정됩니다. 나중에 글 화면에서 해제할 수 있습니다.
                </span>
              </span>
            </label>
          )}

          {canVerifiedOnly && (
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg">
              <input type="checkbox" name="verifiedOnlyReplies" className="mt-0.5 h-4 w-4 accent-[var(--color-signal)]" />
              <span>
                {t('verified-only-replies', language)}
                <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">
                  {t('verified-only-replies-desc', language)}
                </span>
              </span>
            </label>
          )}

          {/* 공지사항은 익명으로 쓸 수 없다 — 공지는 "누가 말하는지"가 내용의 일부다.
              운영진이 아닌 것처럼 보이는 공지는 신뢰할 근거가 사라진다. */}
          {!isNotice && (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg">
              <input type="checkbox" name="anonymous" className="h-4 w-4 accent-[var(--color-signal)]" />
              {t('post-anonymous', language)}
            </label>
          )}
        </div>

        {state.errors?.form && <p className="text-sm text-rose-600">{state.errors.form[0]}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-signal py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 active:scale-[0.99] disabled:opacity-50"
        >
          {pending ? t('submitting-post', language) : t('submit-post', language)}
        </button>
      </aside>
    </form>
  );
}
