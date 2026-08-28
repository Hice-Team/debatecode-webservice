'use client';

// 디베이트메이트 신청 — 이미 메이트이거나 신청 상태면 상태만 표시.
import { useActionState, useState } from 'react';
import { applyDebateMate, type MateApplyState } from '@/app/lib/actions/user-requests';

const initial: MateApplyState = {};

export default function MateApply({ status }: { status: 'none' | 'pending' | 'approved' | 'rejected' | 'mate' }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(applyDebateMate, initial);

  if (status === 'mate' || state.saved === false) {
    return <p className="text-sm text-emerald-700">이미 디베이트메이트로 활동 중입니다. 문제를 출제해 보세요.</p>;
  }
  if (state.saved || status === 'pending') {
    return <p className="text-sm text-fg-secondary">신청이 접수되었습니다. 검토 결과를 기다려 주세요.</p>;
  }
  if (status === 'approved') {
    return <p className="text-sm text-emerald-700">신청이 승인되었습니다. 곧 디베이트메이트 권한이 반영됩니다.</p>;
  }

  return (
    <div>
      {status === 'rejected' && <p className="mb-2 text-xs text-rose-600">이전 신청이 반려되었습니다. 보완 후 다시 신청할 수 있어요.</p>}
      {!open ? (
        <button onClick={() => setOpen(true)} className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(69,49,217,0.39)] hover:shadow-[0_6px_20px_rgba(69,49,217,0.23)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
          디베이트메이트 신청하기
        </button>
      ) : (
       // encType은 적지 않는다 — 서버 액션 폼에서는 React가 multipart를 알아서 정하고,
       // 명시하면 무시되면서 콘솔 경고만 남는다.
       <form action={formAction} className="space-y-3">

          {/* 지원 동기 — 서버(applyDebateMate)가 20자 이상을 요구하고 DB에도 필수 컬럼이다.
              이 칸이 없던 동안에는 제출을 눌러도 검증에서 막혀 아무 일도 일어나지 않았다. */}
          <div>
            <label htmlFor="mate-motivation" className="mb-1 block text-sm font-medium text-ink">
              지원 동기 (필수)
            </label>
            <textarea
              id="mate-motivation"
              name="motivation"
              required
              minLength={20}
              rows={4}
              placeholder="어떤 문제를 만들고 싶은지, 어떤 활동을 하고 싶은지 20자 이상 적어 주세요."
              className="block w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm placeholder:text-fg-quiet shadow-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 hover:border-ink/30"
            />
            {state.errors?.motivation && (
              <p className="mt-1 text-xs text-rose-600">{state.errors.motivation[0]}</p>
            )}
          </div>

          {/* 포트폴리오 — 있으면 심사에 참고한다 */}
          <div>
            <label htmlFor="mate-portfolio" className="mb-1 block text-sm font-medium text-ink">
              포트폴리오 링크 (선택)
            </label>
            <input
              id="mate-portfolio"
              name="portfolioUrl"
              type="url"
              placeholder="https://github.com/..."
              className="block w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm placeholder:text-fg-quiet shadow-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 hover:border-ink/30"
            />
            {state.errors?.portfolioUrl && (
              <p className="mt-1 text-xs text-rose-600">{state.errors.portfolioUrl[0]}</p>
            )}
          </div>

          {/* 파일 업로드 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              신청서 첨부 (필수)
            </label>

            <input
              name="attachment"
              type="file"
              accept=".pdf"
              className="block w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm shadow-sm transition-all file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700 hover:border-ink/30 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            />

            <p className="mt-1 text-[11px] text-fg-muted">
              PDF만 제출 가능합니다. 다른 파일 형식 첨부시 반려될 수 있습니다.
            </p>

            {state.errors?.attachment && (
              <p className="mt-1 text-xs text-rose-600">
                {state.errors.attachment[0]}
              </p>
            )}
          </div>

          {/* 제출 동의 */}
          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="submissionConsent"
                value="true"
                required
                className="mt-0.5 h-4 w-4 rounded border-ink/20"
              />
              <span className="text-xs leading-relaxed text-fg-secondary">
                <span className="font-medium text-ink">[필수]</span>{" "}
                작성한 신청서의 내용을 확인했으며,
                디베이트메이트 신청을 위해 본 신청서를 제출하는 것에 동의합니다.
              </span>
            </label>
          </div>

          {state.errors?.form && (
            <p className="text-xs text-rose-600">
              {state.errors.form[0]}
            </p>
          )}

          {/* 버튼 */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(69,49,217,0.39)] transition-all duration-200 hover:shadow-[0_6px_20px_rgba(69,49,217,0.23)] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {pending ? "제출 중…" : "신청 제출"}
            </button>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-ink/15 bg-white px-5 py-2.5 text-sm font-semibold text-fg-secondary shadow-sm transition-all duration-200 hover:border-ink/30 hover:bg-paper active:scale-[0.98]"
            >
              취소
            </button>
          </div>
      </form>
      )}
    </div>
  );
}
