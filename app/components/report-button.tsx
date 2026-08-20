'use client';

// 신고 버튼 — 커뮤니티 글·답글뿐 아니라 문제, 코드 에디터, AI 답변에도 붙는다.
//
// 대상마다 고를 사유가 다르다. 문제에 "욕설/비방"을 띄우거나 게시글에 "테스트케이스 오류"를
// 띄우면 아무도 안 고르고, 결국 전부 "기타"로 들어와 분류가 무의미해진다.
// 그래서 사유 목록을 대상에서 끌어온다(app/lib/report-targets.ts).
//
// 오류 계열(문제·에디터·AI)에는 재현 정보를 함께 받는다. "안 돼요" 한 줄만 오면
// 운영자가 다시 물어야 하고, 그 왕복에서 대부분의 신고가 흐지부지된다.
import { useActionState, useEffect, useRef, useState } from 'react';
import { submitReport, type ReportState } from '@/app/lib/actions/user-requests';
import {
  reasonsFor,
  isDefectReport,
  REPORT_TARGET_TITLES,
  REPORT_TARGET_DESC,
  type ReportTarget,
} from '@/app/lib/report-targets';

const initial: ReportState = {};

export default function ReportButton({
  targetType,
  targetId,
  variant = 'text',
  label,
  /** 오류 신고 시 자동으로 채워 넣을 재현 정보 (언어·코드·질문 등) */
  autoContext,
  className,
}: {
  targetType: ReportTarget;
  targetId: string;
  /** icon: 아이콘 버튼 / text: 글자 링크 / button: 테두리 버튼 */
  variant?: 'icon' | 'text' | 'button';
  label?: string;
  autoContext?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(submitReport, initial);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * 창을 닫을 때 원래 눌렀던 버튼으로 초점을 돌려준다.
   * 키보드로 신고를 열었다 닫으면 초점이 문서 맨 앞으로 튀어 처음부터 다시 내려와야 했다.
   */
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Esc로 닫고, 열려 있는 동안 뒤 배경은 스크롤되지 않게 잠근다.
  // 첫 요소에 초점을 줘서 키보드만으로도 바로 고를 수 있게 한다.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('input[type="radio"], button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const reasons = reasonsFor(targetType);
  const needsContext = isDefectReport(targetType);
  const buttonLabel = label ?? '신고';

  const triggerClass =
    className ??
    (variant === 'icon'
      ? 'grid h-8 w-8 place-items-center rounded-lg border border-hairline text-fg-muted transition-colors hover:border-rose-200 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
      : variant === 'button'
        ? 'inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:border-rose-300 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
        : 'font-mono text-[11px] text-fg-muted transition-colors hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={buttonLabel}
        title={variant === 'icon' ? buttonLabel : undefined}
        className={triggerClass}
      >
        {variant === 'icon' ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden>
            <path d="M5 21V4m0 1.5h10l-1.6 3.2L15 12H5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          buttonLabel
        )}
      </button>

      {open && (
        // z-[90] — 전역 헤더·공지 배너보다 위. 작은 화면에서도 창 전체가 화면 안에 들어오도록
        // 높이를 100dvh 기준으로 잡고, 넘치는 부분은 본문만 스크롤한다.
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="닫기"
            tabIndex={-1}
            className="absolute inset-0 cursor-default bg-ink/50 backdrop-blur-[2px]"
            onClick={close}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`report-title-${targetId}`}
            className="relative flex max-h-[calc(100dvh-2rem)] w-[min(28rem,100%)] flex-col overflow-hidden rounded-[var(--radius-panel)] bg-white shadow-2xl shadow-black/30 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="shrink-0 border-b border-hairline px-6 py-4 pr-14">
              <h3 id={`report-title-${targetId}`} className="text-lg font-bold text-ink">
                {REPORT_TARGET_TITLES[targetType]}
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-fg-secondary">{REPORT_TARGET_DESC[targetType]}</p>
              <button
                type="button"
                onClick={close}
                aria-label="닫기"
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-fg-quiet transition-colors hover:bg-ink/[0.06] hover:text-ink-soft"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden>
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {state.saved ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm font-semibold text-emerald-700">신고가 접수되었습니다.</p>
                <p className="mt-1 text-xs text-fg-muted">확인 후 처리하겠습니다. 감사합니다.</p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500"
                >
                  닫기
                </button>
              </div>
            ) : (
              <form action={formAction} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                <input type="hidden" name="targetType" value={targetType} />
                <input type="hidden" name="targetId" value={targetId} />
                {needsContext && autoContext && <input type="hidden" name="context" value={autoContext} />}

                <fieldset>
                  <legend className="mb-2 block font-mono text-xs tracking-wider text-fg-secondary">사유</legend>
                  <div className="space-y-1.5">
                    {reasons.map((reason, i) => (
                      // peer-checked — 고른 항목이 테두리와 배경으로 드러나야 한다.
                      // 작은 라디오 점 하나만으로는 무엇을 골랐는지 잘 보이지 않는다.
                      <label
                        key={reason.value}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-hairline px-3 py-2 text-sm transition-colors hover:border-ink/30 has-[:checked]:border-signal has-[:checked]:bg-brand-50/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-signal"
                      >
                        <input
                          type="radio"
                          name="reason"
                          value={reason.value}
                          defaultChecked={i === 0}
                          className="accent-[#1800AC]"
                        />
                        {reason.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label
                    htmlFor={`report-detail-${targetId}`}
                    className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary"
                  >
                    {needsContext ? '어떤 상황이었나요? (자세할수록 빨리 고칩니다)' : '상세 내용 (선택)'}
                  </label>
                  <textarea
                    id={`report-detail-${targetId}`}
                    name="detail"
                    rows={needsContext ? 4 : 2}
                    placeholder={
                      needsContext
                        ? '예: 예제 2번을 그대로 넣었는데 오답으로 나옵니다. 파이썬 3.11 기준으로 로컬에서는 맞습니다.'
                        : '신고 사유를 조금 더 설명해 주세요.'
                    }
                    className="w-full rounded-lg border border-ink/15 bg-paper/40 px-3 py-2 text-sm placeholder:text-fg-quiet focus:outline-none focus:ring-2 focus:ring-signal/50"
                  />
                  {needsContext && autoContext && (
                    <p className="mt-1.5 rounded-lg bg-paper/60 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-fg-muted">
                      현재 화면 정보(언어·코드·질문 등)가 함께 전송됩니다.
                    </p>
                  )}
                </div>

                  {state.errors?.form && <p className="text-xs text-rose-600">{state.errors.form[0]}</p>}
                </div>

                {/* 버튼 줄은 스크롤 밖에 고정한다 — 사유가 많아도 "신고하기"를 찾아 내려갈 필요가 없다 */}
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline bg-white px-6 py-4">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-ink/15 px-4 py-2 text-sm text-fg-secondary hover:border-ink/40"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {pending ? '접수 중…' : '신고하기'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
