'use client';

// 커뮤니티 신고 버튼 — 게시글/답글에 부착. 클릭 시 사유 선택 모달 → submitReport 액션.
import { useActionState, useState } from 'react';
import { submitReport, type ReportState } from '@/app/lib/actions/user-requests';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

const REASONS = ['spam', 'abuse', 'illegal', 'etc'] as const;

const initial: ReportState = {};

export default function ReportButton({
  targetType,
  targetId,
  // 글 머리말에서는 수정·삭제와 같은 크기의 아이콘 버튼, 댓글 액션 줄에서는 글자 링크로 쓴다
  variant = 'text',
}: {
  targetType: 'post' | 'comment';
  targetId: string;
  variant?: 'icon' | 'text';
}) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(submitReport, initial);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t('report', language)}
        title={variant === 'icon' ? t('report', language) : undefined}
        className={
          variant === 'icon'
            ? 'grid h-8 w-8 place-items-center rounded-lg border border-ink/10 text-ink-soft/45 transition-colors hover:border-rose-200 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
            : 'font-mono text-[11px] text-ink-soft/45 transition-colors hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
        }
      >
        {variant === 'icon' ? (
          // 깃발
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden>
            <path d="M5 21V4m0 1.5h10l-1.6 3.2L15 12H5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          t('report', language)
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div aria-hidden className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`report-title-${targetId}`}
            className="relative w-[min(24rem,100%)] rounded-2xl bg-white shadow-2xl shadow-black/30 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="border-b border-ink/10 px-6 py-4">
              <h3 id={`report-title-${targetId}`} className="text-lg font-bold text-ink">
                {t(targetType === 'post' ? 'report-post' : 'report-comment', language)}
              </h3>
              <p className="mt-0.5 text-xs text-ink-soft/60">{t('report-desc', language)}</p>
            </div>

            {state.saved ? (
              <div className="px-6 py-6 text-center">
                <p className="text-sm text-emerald-700">{t('report-done', language)}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500"
                >
                  {t('close', language)}
                </button>
              </div>
            ) : (
              <form action={formAction} className="space-y-4 px-6 py-5">
                <input type="hidden" name="targetType" value={targetType} />
                <input type="hidden" name="targetId" value={targetId} />
                <fieldset>
                  <legend className="block font-mono text-xs text-ink-soft/60 tracking-wider mb-2">{t('report-reason', language)}</legend>
                  <div className="space-y-1.5">
                    {REASONS.map((reason, i) => (
                      <label key={reason} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink/10 px-3 py-2 text-sm hover:border-ink/30">
                        <input type="radio" name="reason" value={reason} defaultChecked={i === 0} className="accent-[#1800AC]" />
                        {t(`report-reason-${reason}`, language)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <label htmlFor={`report-detail-${targetId}`} className="block font-mono text-xs text-ink-soft/60 tracking-wider mb-1.5">
                    {t('report-detail', language)}
                  </label>
                  <textarea
                    id={`report-detail-${targetId}`}
                    name="detail"
                    rows={2}
                    placeholder={t('report-detail-placeholder', language)}
                    className="w-full rounded-lg border border-ink/15 bg-paper/40 px-3 py-2 text-sm placeholder:text-ink-soft/40 focus:outline-none focus:ring-2 focus:ring-signal/50"
                  />
                </div>
                {state.errors?.form && <p className="text-xs text-rose-600">{state.errors.form[0]}</p>}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink-soft/70 hover:border-ink/40">
                    {t('cancel', language)}
                  </button>
                  <button type="submit" disabled={pending} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                    {pending ? t('report-submitting', language) : t('report-submit', language)}
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
