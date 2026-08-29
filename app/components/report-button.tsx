'use client';

// 신고 버튼 — 커뮤니티 글·답글뿐 아니라 문제, 코드 에디터, AI 답변에도 붙는다.
//
// 대상마다 고를 사유가 다르다. 문제에 "욕설/비방"을 띄우거나 게시글에 "테스트케이스 오류"를
// 띄우면 아무도 안 고르고, 결국 전부 "기타"로 들어와 분류가 무의미해진다.
// 그래서 사유 목록을 대상에서 끌어온다(app/lib/report-targets.ts).
//
// 오류 계열(문제·에디터·AI)에는 재현 정보를 함께 받는다. "안 돼요" 한 줄만 오면
// 운영자가 다시 물어야 하고, 그 왕복에서 대부분의 신고가 흐지부지된다.
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { submitReport, type ReportState } from '@/app/lib/actions/user-requests';
import {
  reasonsFor,
  isDefectReport,
  REPORT_TARGET_TITLES,
  REPORT_TARGET_DESC,
  type ReportTarget,
} from '@/app/lib/report-targets';

const initial: ReportState = {};

/** 바뀔 일이 없는 값을 useSyncExternalStore로 읽을 때의 빈 구독 */
const subscribeNever = () => () => {};

export default function ReportButton({
  targetType,
  targetId,
  variant = 'text',
  label,
  /** 오류 신고 시 자동으로 채워 넣을 재현 정보 (언어·코드·질문 등) */
  autoContext,
  anchorRef,
  className,
}: {
  targetType: ReportTarget;
  targetId: string;
  /** icon: 아이콘 버튼 / text: 글자 링크 / button: 테두리 버튼 */
  variant?: 'icon' | 'text' | 'button';
  label?: string;
  autoContext?: string;
  /**
   * 창을 띄울 기준 영역. 주면 그 요소 위에 얹고, 없으면 화면 전체를 기준으로 한다.
   *
   * 코드 에디터에서 화면 중앙에 띄우면 오른쪽 에디터를 가려, 무엇을 신고하려는지
   * 보면서 쓸 수가 없다. 문제 설명이 있는 좌측 패널 안에 띄운다.
   */
  anchorRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(submitReport, initial);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // 포털은 브라우저에만 있다 — 서버 스냅샷을 false로 두면 하이드레이션이 어긋나지 않는다.
  // (같은 이유로 app/components/domain-notice.tsx도 이 훅을 쓴다)
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  // 기준 영역의 화면상 위치. 스플리터를 끌면 폭이 바뀌므로 계속 따라간다.
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const el = anchorRef?.current;
    if (!open || !el) return setBox(null);
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, anchorRef]);

  // 접수 완료는 창 안이 아니라 떠 있는 토스트로 알린다 — 창은 즉시 닫고,
  // "무엇이 접수됐는지"만 화면 구석에서 잠깐 말한다.
  //
  // 액션 결과가 바뀐 순간을 렌더 중에 잡는다. effect에서 setState를 부르면 한 번 더
  // 렌더되고(연쇄 렌더), 그 사이에 창이 열린 채로 깜빡인다.
  // useActionState는 제출할 때마다 새 객체를 주므로 객체 동일성으로 "이번 결과"를 가른다.
  const [toast, setToast] = useState(false);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.saved) {
      setOpen(false);
      setToast(true);
    }
  }

  // 자동으로 사라지는 시계 — setState가 콜백 안에서만 일어난다.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(false), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

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

      {open && mounted && createPortal(
        // 반드시 body로 빼서 띄운다.
        //
        // 예전에는 버튼 자리에 그대로 그렸는데, 코드 에디터의 상단 스트립이 backdrop-blur로
        // 자기 쌓임 맥락(stacking context)을 만들어 z-[90]이 그 안에서만 통했다.
        // 그래서 창 위쪽이 내비게이션·고정 뱃지 뒤로 숨었다. 포털로 빼면 z 값이
        // 문서 전체 기준이 되어 그런 일이 없다.
        //
        // 위치는 기준 영역(box)이 있으면 그 안에서, 없으면 화면 전체에서 가운데.
        // 헤더 높이(64px)만큼은 어느 쪽이든 비워 둔다 — 창 위쪽이 헤더에 물리지 않게.
        <div
          className="fixed z-[90] flex items-center justify-center p-4"
          style={
            box
              ? { top: Math.max(box.top, 64), left: box.left, width: box.width, height: Math.max(box.height - Math.max(64 - box.top, 0), 200) }
              : { top: 64, left: 0, right: 0, bottom: 0 }
          }
        >
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
            className="relative flex max-h-full w-[min(28rem,100%)] flex-col overflow-hidden rounded-[var(--radius-panel)] bg-white shadow-2xl shadow-black/30 animate-in fade-in zoom-in-95 duration-200"
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
          </div>
        </div>,
        document.body,
      )}

      {/* 접수 완료 — 화면 우측 상단에 잠깐 떠 있다 사라진다.
          창을 한 번 더 닫게 하지 않는다. 이미 할 일은 끝났다. */}
      {toast && mounted && createPortal(
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-20 z-[95] flex items-start gap-2.5 rounded-[var(--radius-panel)] border border-emerald-200 bg-white px-4 py-3 shadow-[0_12px_32px_rgba(8,9,26,0.18)] animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <span aria-hidden className="mt-0.5 text-emerald-600">
            ✓
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink">신고가 접수되었습니다.</span>
            <span className="mt-0.5 block text-xs text-fg-muted">확인 후 처리하겠습니다.</span>
          </span>
          <button
            type="button"
            onClick={() => setToast(false)}
            aria-label="알림 닫기"
            className="dc-tap -mr-1 ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-quiet transition-colors hover:bg-ink/[0.06] hover:text-ink-soft"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2]" aria-hidden>
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
