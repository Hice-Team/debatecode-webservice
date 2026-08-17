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
    return <p className="text-sm text-ink-soft/60">신청이 접수되었습니다. 검토 결과를 기다려 주세요.</p>;
  }
  if (status === 'approved') {
    return <p className="text-sm text-emerald-700">신청이 승인되었습니다. 곧 디베이트메이트 권한이 반영됩니다.</p>;
  }

  return (
    <div>
      {status === 'rejected' && <p className="mb-2 text-xs text-rose-600">이전 신청이 반려되었습니다. 보완 후 다시 신청할 수 있어요.</p>}
      {!open ? (
        <button onClick={() => setOpen(true)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
          디베이트메이트 신청하기
        </button>
      ) : (
       <form
          action={formAction}
          encType="multipart/form-data"
          className="space-y-3"
        >

          {/* 파일 업로드 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              신청서 첨부 (필수)
            </label>

            <input
              name="attachment"
              type="file"
              accept=".pdf"
              className="block w-full rounded-lg border border-ink/15 bg-paper/40 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700"
            />

            <p className="mt-1 text-[11px] text-ink-soft/50">
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
              <span className="text-xs leading-relaxed text-ink-soft/70">
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
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {pending ? "제출 중…" : "신청 제출"}
            </button>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-ink/15 px-4 py-2 text-sm text-ink-soft/60 hover:border-ink/40"
            >
              취소
            </button>
          </div>
      </form>
      )}
    </div>
  );
}
