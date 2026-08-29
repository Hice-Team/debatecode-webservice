'use client';

// AI 응답 하단 툴바 — [👍] [👎] [새로고침] [복사] [⋮]
//
// 더보기(⋮)에는 이 답변 하나에만 적용되는 동작을 모은다.
//   새 채팅에서 브랜치 생성 · 듣기(TTS) · .json 내보내기 · 구글로 검색하기 ·
//   법적 문제 신고 · 응답 세부정보 보기
// 컴포저의 "대화 내보내기"가 세션 전체를 다루는 것과 대비된다.
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import { branchFromMessage, reportAiMessage } from '@/app/lib/actions/ai-search';
import { clearAiFeedback, submitAiFeedback } from '@/app/lib/actions/ai-feedback';
import {
  FEEDBACK_COMMENT_MAX,
  reasonLabel,
  reasonsFor,
  type FeedbackRating,
} from '@/app/lib/ai/feedback-reasons';
import { findSearchModel } from '@/app/lib/ai/search-models';
import { EFFORT_HINTS, EFFORT_LABELS, asEffort } from '@/app/lib/ai/effort';
import { exportSingleAnswer } from './export-session';
import type { ConversationMessage } from './conversation';
import Toast from '@/app/components/toast';

type Feedback = FeedbackRating | null;

const ICON = 'h-[18px] w-[18px] fill-none stroke-current stroke-[1.6]';
const MENU_ICON = 'h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.5]';

const REPORT_REASONS = [
  { value: 'copyright', labelKey: 'report-reason-copyright' },
  { value: 'defamation', labelKey: 'report-reason-defamation' },
  { value: 'privacy', labelKey: 'report-reason-privacy' },
  { value: 'illegal', labelKey: 'report-reason-illegal' },
  { value: 'etc', labelKey: 'report-reason-etc' },
] as const;

export default function ResponseToolbar({
  message,
  messages,
  onRegenerate,
  busy,
}: {
  message: ConversationMessage;
  messages: ConversationMessage[];
  onRegenerate: () => void;
  busy: boolean;
}) {
  const { language } = useLanguage();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(message.feedback?.rating ?? null);
  // 사유 패널 — 평가를 누른 직후에만 열린다. 사유는 선택이라 닫아도 평가는 남는다.
  const [feedbackPanel, setFeedbackPanel] = useState<FeedbackRating | null>(null);
  const [feedbackReasons, setFeedbackReasons] = useState<string[]>(message.feedback?.reasons ?? []);
  const [feedbackComment, setFeedbackComment] = useState(message.feedback?.comment ?? '');
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [branching, setBranching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0].value);
  const [reportDetail, setReportDetail] = useState('');
  const [reportResult, setReportResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  const model = findSearchModel(message.model);

  // 메뉴 바깥 클릭 / Esc 로 닫기
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(message.content);
      // 아이콘만 잠깐 바뀌던 것을 토스트로 바꾼다 — 답변이 길면 버튼이 화면 밖에 있어
      // 눌러 놓고도 복사가 됐는지 알 수 없었다.
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없는 환경 — 조용히 무시한다
    }
  }

  /**
   * 👍/👎 — 누르는 즉시 저장한다.
   *
   * 사유를 다 채워야 저장되는 방식이면 대부분 중간에 그만두고, 그러면 가장 흔한 신호인
   * "그냥 별로였다"가 통째로 사라진다. 그래서 평가부터 남기고 사유는 뒤이어 선택으로 받는다.
   */
  function rate(next: FeedbackRating) {
    const previous = feedback;
    const cancelling = previous === next;

    // 낙관적 갱신 — 왕복을 기다리며 버튼이 멈춰 있으면 두 번 누르게 된다
    setFeedback(cancelling ? null : next);
    setFeedbackPanel(cancelling ? null : next);
    setFeedbackNotice(null);
    if (cancelling) {
      setFeedbackReasons([]);
      setFeedbackComment('');
    } else if (previous !== next) {
      // 평가를 뒤집으면 이전 사유는 더 이상 맞지 않는다
      setFeedbackReasons([]);
    }

    startTransition(async () => {
      const result = cancelling
        ? await clearAiFeedback(message.id)
        : await submitAiFeedback({ messageId: message.id, rating: next, reasons: [], comment: feedbackComment });
      if (!result.saved) {
        setFeedback(previous); // 되돌린다 — 저장되지 않은 평가를 남은 것처럼 보이면 안 된다
        setFeedbackPanel(null);
        setFeedbackNotice(t('feedback-failed', language));
      }
    });
  }

  function toggleReason(reason: string) {
    setFeedbackReasons((prev) => (prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]));
  }

  /** 사유·보충 설명을 덧붙인다 — 평가 자체는 이미 저장돼 있다. */
  function sendFeedbackDetail() {
    const rating = feedbackPanel;
    if (!rating) return;
    startTransition(async () => {
      const result = await submitAiFeedback({
        messageId: message.id,
        rating,
        reasons: feedbackReasons,
        comment: feedbackComment,
      });
      setFeedbackNotice(t(result.saved ? 'feedback-thanks' : 'feedback-failed', language));
      if (result.saved) setFeedbackPanel(null);
    });
  }

  /**
   * 분기 — 이 답변까지의 대화 전체를 복사해 새 세션을 연다.
   * 메시지가 많으면 한 박자 걸리므로 메뉴 항목에 진행 표시를 남긴다.
   */
  function branch() {
    setBranching(true);
    startTransition(async () => {
      const result = await branchFromMessage(message.id);
      if (result.sessionId) {
        router.push(`/study/search?session=${result.sessionId}`);
        return; // 화면이 곧 바뀌므로 상태를 되돌리지 않는다
      }
      setBranching(false);
    });
  }

  function submitReport() {
    startTransition(async () => {
      const form = new FormData();
      form.set('messageId', message.id);
      form.set('reason', reportReason);
      form.set('detail', reportDetail);
      const result = await reportAiMessage(form);
      setReportResult(result.saved ? t('report-done', language) : (result.error ?? ''));
      if (result.saved) setReportDetail('');
    });
  }

  const buttonClass =
    'grid h-9 w-9 place-items-center rounded-full text-fg-muted transition-colors hover:bg-ink/[0.05] hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-35';
  const menuItemClass =
    'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-fg transition-colors hover:bg-paper disabled:opacity-40';

  return (
    <div className="mt-6 border-t border-hairline pt-3">
      <div className="flex flex-wrap items-center gap-1">
        {/* 👍 */}
        <button
          type="button"
          onClick={() => rate('up')}
          disabled={busy}
          aria-pressed={feedback === 'up'}
          className={`${buttonClass} ${feedback === 'up' ? 'text-signal hover:text-signal' : ''}`}
          aria-label={t('feedback-helpful', language)}
          title={t('feedback-helpful', language)}
        >
          <svg viewBox="0 0 24 24" className={ICON} fill={feedback === 'up' ? 'currentColor' : 'none'} aria-hidden>
            <path d="M7 21V10l4.5-7a2 2 0 0 1 2.8 2.2L13.4 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 21H7Zm0 0H3V10h4" strokeLinejoin="round" />
          </svg>
        </button>

        {/* 👎 */}
        <button
          type="button"
          onClick={() => rate('down')}
          disabled={busy}
          aria-pressed={feedback === 'down'}
          className={`${buttonClass} ${feedback === 'down' ? 'text-rose-500 hover:text-rose-500' : ''}`}
          aria-label={t('feedback-not-helpful', language)}
          title={t('feedback-not-helpful', language)}
        >
          <svg viewBox="0 0 24 24" className={ICON} fill={feedback === 'down' ? 'currentColor' : 'none'} aria-hidden>
            <path d="M17 3v11l-4.5 7a2 2 0 0 1-2.8-2.2L10.6 15H5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.2 3H17Zm0 0h4v11h-4" strokeLinejoin="round" />
          </svg>
        </button>

        {/* 새로고침 — 같은 질문으로 답변을 다시 생성한다 */}
        <button
          type="button"
          onClick={onRegenerate}
          disabled={busy || pending}
          className={buttonClass}
          aria-label={t('regenerate', language)}
          title={t('regenerate', language)}
        >
          <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
            <path d="M20 12a8 8 0 1 1-2.3-5.6" strokeLinecap="round" />
            <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* 복사 */}
        <button
          type="button"
          onClick={copyAnswer}
          className={buttonClass}
          aria-label={t('copy', language)}
          title={copied ? t('copied', language) : t('copy', language)}
        >
          {copied ? (
            <svg viewBox="0 0 24 24" className={`${ICON} text-emerald-600`} aria-hidden>
              <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {/* ⋮ 더보기 */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={buttonClass}
            aria-label={t('more-actions', language)}
            title={t('more-actions', language)}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden>
              <circle cx="12" cy="5" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="12" cy="19" r="1.7" />
            </svg>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute bottom-full left-0 z-30 mb-2 w-[15.5rem] overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white py-1.5 shadow-xl shadow-ink/10 animate-in fade-in zoom-in-95 duration-150"
            >
              <button type="button" role="menuitem" disabled={pending || branching} className={menuItemClass} onClick={() => { branch(); setMenuOpen(false); }}>
                <svg viewBox="0 0 24 24" className={MENU_ICON} aria-hidden>
                  <circle cx="6" cy="6" r="2.5" />
                  <circle cx="6" cy="18" r="2.5" />
                  <circle cx="18" cy="9" r="2.5" />
                  <path d="M6 8.5v7M8.5 6.5h5a2 2 0 0 1 2 2v.5" strokeLinecap="round" />
                </svg>
                {branching ? t('ai-branching', language) : t('ai-branch-new-chat', language)}
              </button>

              <button type="button" role="menuitem" className={menuItemClass} onClick={() => { exportSingleAnswer(messages, message.id); setMenuOpen(false); }}>
                <svg viewBox="0 0 24 24" className={MENU_ICON} aria-hidden>
                  <path d="M12 4v11m0 0 3.5-3.5M12 15l-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17" strokeLinecap="round" />
                </svg>
                {t('ai-export-answer', language)}
              </button>

              <button type="button" role="menuitem" className={menuItemClass} onClick={() => { setReportResult(null); setReportOpen(true); setMenuOpen(false); }}>
                <svg viewBox="0 0 24 24" className={MENU_ICON} aria-hidden>
                  <path d="M5 21V4h9l-1 3h7l-1.5 4.5L19 16h-8l-1-3H5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t('ai-report-legal', language)}
              </button>

              <button type="button" role="menuitem" className={menuItemClass} onClick={() => { setAboutOpen(true); setMenuOpen(false); }}>
                <svg viewBox="0 0 24 24" className={MENU_ICON} aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
                </svg>
                {t('about-response', language)}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 복사 알림 — 입력창 바로 위 가운데. 2초 뒤 사라진다. */}
      <Toast open={copied} placement="above-composer">
        <span aria-hidden className="mt-0.5 text-emerald-600">
          ✓
        </span>
        <span className="text-sm font-medium text-ink">{t('copied', language)}</span>
      </Toast>

      {/* 사유 패널 — 평가를 누른 직후에만 열린다. 닫아도 평가 자체는 이미 저장돼 있다. */}
      {feedbackPanel && (
        <div className="mt-3 rounded-[var(--radius-panel)] border border-hairline bg-paper/60 p-3.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-start gap-2">
            <p className="text-[13px] font-semibold text-ink">
              {t(feedbackPanel === 'up' ? 'feedback-why-up' : 'feedback-why-down', language)}
            </p>
            <button
              type="button"
              onClick={() => setFeedbackPanel(null)}
              aria-label={t('close', language)}
              className="ml-auto -mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-fg-quiet transition-colors hover:bg-ink/[0.06] hover:text-ink-soft"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.6]" aria-hidden>
                <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {reasonsFor(feedbackPanel).map((reason) => {
              const on = feedbackReasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleReason(reason)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                    on
                      ? 'border-signal bg-signal/10 text-signal'
                      : 'border-hairline text-fg-secondary hover:border-ink/25 hover:text-ink-soft'
                  }`}
                >
                  {reasonLabel(reason, language)}
                </button>
              );
            })}
          </div>

          <textarea
            value={feedbackComment}
            onChange={(e) => setFeedbackComment(e.target.value.slice(0, FEEDBACK_COMMENT_MAX))}
            rows={2}
            maxLength={FEEDBACK_COMMENT_MAX}
            placeholder={t('feedback-comment-placeholder', language)}
            className="mt-2.5 w-full resize-none rounded-xl border border-hairline bg-white px-3 py-2 text-[13px] text-ink placeholder:text-fg-quiet focus:border-signal focus:outline-none"
          />

          <div className="mt-2 flex items-center justify-end gap-2">
            <span className="mr-auto font-mono text-[10px] text-fg-quiet">
              {feedbackComment.length}/{FEEDBACK_COMMENT_MAX}
            </span>
            <button
              type="button"
              onClick={sendFeedbackDetail}
              disabled={pending}
              className="rounded-xl bg-signal px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40"
            >
              {t('feedback-send', language)}
            </button>
          </div>
        </div>
      )}

      {feedbackNotice && (
        <p role="status" className="mt-2 text-[12px] text-fg-muted">
          {feedbackNotice}
        </p>
      )}

      {/* 응답 세부정보 */}
      {aboutOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="about-response-title">
          <button type="button" aria-label={t('close', language)} onClick={() => setAboutOpen(false)} className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
          <section className="relative z-10 w-full max-w-md rounded-[var(--radius-panel)] border border-hairline bg-white p-6 shadow-2xl shadow-ink/25">
            <h3 id="about-response-title" className="text-lg font-bold text-ink">
              {t('about-response', language)}
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">{t('about-engine', language)}</dt>
                <dd className="mt-0.5 text-fg">
                  {model.label} · {model.vendor}
                  <span className="ml-1.5 font-mono text-[11px] text-fg-quiet">{model.repo}</span>
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">{t('about-generated-at', language)}</dt>
                <dd className="mt-0.5 text-fg">{new Date(message.createdAt).toLocaleString(language === 'en' ? 'en-US' : 'ko-KR')}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">{t('about-length', language)}</dt>
                <dd className="mt-0.5 text-fg">{message.content.length.toLocaleString()}자</dd>
              </div>
              {/* 토큰 — 공급자가 준 실측이 아니면 그렇다고 밝힌다. 요금·한도가 걸린 숫자라
                  추정치를 실측처럼 보이게 두면 안 된다. */}
              {(message.promptTokens != null || message.completionTokens != null) && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">
                    {t('about-tokens', language)}
                  </dt>
                  <dd className="mt-0.5 text-fg">
                    {((message.promptTokens ?? 0) + (message.completionTokens ?? 0)).toLocaleString()} tokens
                    <span className="ml-1.5 font-mono text-[11px] text-fg-quiet">
                      ({t('about-tokens-in', language)} {(message.promptTokens ?? 0).toLocaleString()} ·{' '}
                      {t('about-tokens-out', language)} {(message.completionTokens ?? 0).toLocaleString()})
                    </span>
                    {message.tokensEstimated && (
                      <span className="ml-1.5 rounded-full border border-hairline bg-paper px-1.5 py-px text-[10px] text-fg-muted">
                        {t('about-tokens-estimated', language)}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {message.effort && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">
                    {t('about-effort', language)}
                  </dt>
                  <dd className="mt-0.5 text-fg">
                    {EFFORT_LABELS[asEffort(message.effort)]}
                    <span className="ml-1.5 text-[11px] text-fg-quiet">
                      {EFFORT_HINTS[asEffort(message.effort)]}
                    </span>
                  </dd>
                </div>
              )}
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">{t('about-sources-label', language)}</dt>
                <dd className="mt-0.5 text-fg">{t('about-sources-model-only', language)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-fg-muted">{t('about-feedback-note', language)}</p>
            <button
              type="button"
              onClick={() => setAboutOpen(false)}
              className="mt-5 w-full rounded-xl bg-signal py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              {t('close', language)}
            </button>
          </section>
        </div>
      )}

      {/* 법적 문제 신고 */}
      {reportOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <button type="button" aria-label={t('close', language)} onClick={() => setReportOpen(false)} className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
          <section className="relative z-10 w-full max-w-md rounded-[var(--radius-panel)] border border-hairline bg-white p-6 shadow-2xl shadow-ink/25">
            <h3 id="report-title" className="text-lg font-bold text-ink">
              {t('ai-report-legal', language)}
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{t('ai-report-desc', language)}</p>

            <fieldset className="mt-4 space-y-1.5">
              <legend className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">
                {t('report-reason', language)}
              </legend>
              {REPORT_REASONS.map((reason) => (
                <label key={reason.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-fg hover:bg-paper">
                  <input
                    type="radio"
                    name="ai-report-reason"
                    value={reason.value}
                    checked={reportReason === reason.value}
                    onChange={() => setReportReason(reason.value)}
                    className="accent-[color:var(--color-signal,#1800AC)]"
                  />
                  {t(reason.labelKey, language)}
                </label>
              ))}
            </fieldset>

            <textarea
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={t('report-detail-placeholder', language)}
              className="mt-3 w-full resize-none rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-fg-quiet focus:border-signal focus:outline-none"
            />

            {reportResult && <p className="mt-2 text-[12px] text-signal">{reportResult}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="rounded-xl border border-hairline px-4 py-2 text-sm font-medium text-fg-secondary transition hover:border-ink/25"
              >
                {t('close', language)}
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={pending}
                className="rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40"
              >
                {t('report-submit', language)}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
