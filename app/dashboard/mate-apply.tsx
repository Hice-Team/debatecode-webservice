'use client';

// 디베이트메이트 신청 — 이미 메이트이거나 신청 상태면 상태만 표시.
//
// 신청서는 PDF 한 장이다. 예전에는 지원 동기를 폼 밖에서 요구해
// "제출을 눌러도 아무 일이 없는" 상태였고, 지금은 받지 않는 값을 검증하지도 않는다.
// 대신 흐름을 두 단계로 못 박는다 — ① 양식을 받아 채우고 ② 그 파일을 올린다.
// 두 단계를 한 화면에 나란히 두면 "무엇부터 해야 하나"에서 멈춘다.
import { useActionState, useState } from 'react';
import { applyDebateMate, type MateApplyState } from '@/app/lib/actions/user-requests';
import FileDropzone from '@/app/components/file-dropzone';

const initial: MateApplyState = {};

/** 신청서 양식 — public/에 두고 링크로 내려받는다 */
export const MATE_FORM_PATH = '/forms/debate-mate-application.pdf';

/** 단계 표식 — 번호는 장식이 아니라 순서다 */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 font-mono text-[11px] font-bold text-white"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-fg">{title}</p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

export default function MateApply({ status }: { status: 'none' | 'pending' | 'approved' | 'rejected' | 'mate' }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(applyDebateMate, initial);
  const [file, setFile] = useState<File | null>(null);

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
      {status === 'rejected' && (
        <p className="mb-2 text-xs text-rose-600">이전 신청이 반려되었습니다. 보완 후 다시 신청할 수 있어요.</p>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(69,49,217,0.39)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(69,49,217,0.23)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          디베이트메이트 신청하기
        </button>
      ) : (
        // encType은 적지 않는다 — 서버 액션 폼에서는 React가 multipart를 알아서 정하고,
        // 명시하면 무시되면서 콘솔 경고만 남는다.
        <form action={formAction} className="space-y-5">
          <Step n={1} title="신청서 양식을 내려받아 작성하세요">
            <a
              href={MATE_FORM_PATH}
              download
              className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden>
                <path d="M12 4v11m0 0 3.5-3.5M12 15l-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17" strokeLinecap="round" />
              </svg>
              신청서 양식 (PDF)
            </a>
            <p className="mt-1.5 text-[11px] text-fg-muted">
              지원 동기와 활동 계획은 이 양식 안에 있습니다. 따로 적을 칸은 없습니다.
            </p>
          </Step>

          <Step n={2} title="작성한 PDF를 올리세요">
            <FileDropzone
              name="attachment"
              accept=".pdf,application/pdf"
              file={file}
              onFile={setFile}
              hint="PDF만 올릴 수 있습니다. 끌어다 놓거나 눌러서 고르세요."
            />
            {state.errors?.attachment && (
              <p className="mt-1.5 text-xs text-rose-600">{state.errors.attachment[0]}</p>
            )}
          </Step>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              name="submissionConsent"
              value="true"
              required
              className="mt-0.5 h-4 w-4 rounded border-hairline accent-[#1800AC]"
            />
            <span className="text-xs leading-relaxed text-fg-secondary">
              <span className="font-medium text-fg">[필수]</span> 작성한 신청서의 내용을 확인했으며, 디베이트메이트
              신청을 위해 본 신청서를 제출하는 것에 동의합니다.
            </span>
          </label>

          {state.errors?.form && <p className="text-xs text-rose-600">{state.errors.form[0]}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending || !file}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
            >
              {pending ? '제출 중…' : '신청 제출'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-hairline px-4 py-2 text-sm text-fg-secondary transition-colors hover:border-fg-quiet"
            >
              취소
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
