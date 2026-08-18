'use client';

// 신고 버튼 — 커뮤니티 글·답글뿐 아니라 문제, 코드 에디터, AI 답변에도 붙는다.
//
// 대상마다 고를 사유가 다르다. 문제에 "욕설/비방"을 띄우거나 게시글에 "테스트케이스 오류"를
// 띄우면 아무도 안 고르고, 결국 전부 "기타"로 들어와 분류가 무의미해진다.
// 그래서 사유 목록을 대상에서 끌어온다(app/lib/report-targets.ts).
//
// 오류 계열(문제·에디터·AI)에는 재현 정보를 함께 받는다. "안 돼요" 한 줄만 오면
// 운영자가 다시 물어야 하고, 그 왕복에서 대부분의 신고가 흐지부지된다.
import { useActionState, useState } from 'react';
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

  const reasons = reasonsFor(targetType);
  const needsContext = isDefectReport(targetType);
  const buttonLabel = label ?? '신고';

  const triggerClass =
    className ??
    (variant === 'icon'
      ? 'grid h-8 w-8 place-items-center rounded-lg border border-ink/10 text-ink-soft/45 transition-colors hover:border-rose-200 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
      : variant === 'button'
        ? 'inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink-soft/70 transition-colors hover:border-rose-300 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
        : 'font-mono text-[11px] text-ink-soft/45 transition-colors hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600');

  return (
    <>
      <button
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div aria-hidden className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`report-title-${targetId}`}
            className="relative w-[min(28rem,100%)] overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/30 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="border-b border-ink/10 px-6 py-4">
              <h3 id={`report-title-${targetId}`} className="text-lg font-bold text-ink">
                {REPORT_TARGET_TITLES[targetType]}
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft/60">{REPORT_TARGET_DESC[targetType]}</p>
            </div>

            {state.saved ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm font-semibold text-emerald-700">신고가 접수되었습니다.</p>
                <p className="mt-1 text-xs text-ink-soft/55">확인 후 처리하겠습니다. 감사합니다.</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500"
                >
                  닫기
                </button>
              </div>
            ) : (
              <form action={formAction} className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
                <input type="hidden" name="targetType" value={targetType} />
                <input type="hidden" name="targetId" value={targetId} />
                {needsContext && autoContext && <input type="hidden" name="context" value={autoContext} />}

                <fieldset>
                  <legend className="mb-2 block font-mono text-xs tracking-wider text-ink-soft/60">사유</legend>
                  <div className="space-y-1.5">
                    {reasons.map((reason, i) => (
                      <label
                        key={reason.value}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink/10 px-3 py-2 text-sm hover:border-ink/30"
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
                    className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60"
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
                    className="w-full rounded-lg border border-ink/15 bg-paper/40 px-3 py-2 text-sm placeholder:text-ink-soft/40 focus:outline-none focus:ring-2 focus:ring-signal/50"
                  />
                  {needsContext && autoContext && (
                    <p className="mt-1.5 rounded-lg bg-paper/60 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-ink-soft/50">
                      현재 화면 정보(언어·코드·질문 등)가 함께 전송됩니다.
                    </p>
                  )}
                </div>

                {state.errors?.form && <p className="text-xs text-rose-600">{state.errors.form[0]}</p>}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink-soft/70 hover:border-ink/40"
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
