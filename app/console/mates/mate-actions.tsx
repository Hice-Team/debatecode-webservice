'use client';

// 메이트 경고 / 권한 회수.
//
// 회수는 확인 단계를 둔다. 예전에는 목록의 입력칸에 사유를 적고 버튼 한 번이면 바로
// 실행됐는데, 회수는 해당 계정의 debateQ·출제 권한이 즉시 사라지는 조치라 되돌리기 번거롭다.
import { useState } from 'react';
import { revokeDebateMate, warnDebateMate } from '@/app/lib/actions/admin';
import { FOCUS } from '../ui';

export function WarnForm({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`shrink-0 rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg hover:border-amber-300 hover:text-amber-800 ${FOCUS}`}
      >
        경고
      </button>
    );
  }

  return (
    <form action={warnDebateMate} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="reason"
        required
        autoFocus
        aria-label={`${name} 경고 사유`}
        placeholder="경고 사유 (활동 이력에 남습니다)"
        className={`min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs placeholder:text-fg-quiet ${FOCUS}`}
      />
      <button className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
        경고 발급
      </button>
      <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-xl border border-ink/15 px-3 py-1.5 text-xs text-fg-secondary">
        취소
      </button>
    </form>
  );
}

export function RevokeForm({ userId, name }: { userId: string; name: string }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [reason, setReason] = useState('');

  if (step === 0) {
    return (
      <button
        type="button"
        onClick={() => setStep(1)}
        className={`shrink-0 rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg hover:border-rose-300 hover:text-rose-700 ${FOCUS}`}
      >
        권한 회수
      </button>
    );
  }

  return (
    <form action={revokeDebateMate} className="w-full space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="reason"
        required
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label={`${name} 권한 회수 사유`}
        placeholder="회수 사유 (본인 요청 / 활동 위반 등) — 본인에게 표시됩니다"
        className={`w-full rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs placeholder:text-fg-quiet ${FOCUS}`}
      />
      {step === 2 && (
        <p className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-[11px] leading-relaxed text-rose-900">
          <strong>{name}</strong>의 디베이트메이트 권한을 회수합니다. 일반 사용자로 돌아가며 debateQ와 문제 출제가
          즉시 닫힙니다. 재신청은 가능합니다.
        </p>
      )}
      <div className="flex items-center gap-2">
        {step === 1 ? (
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={reason.trim().length < 2}
            className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
          >
            회수 진행
          </button>
        ) : (
          <button className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">
            확인 · 권한 회수
          </button>
        )}
        <button
          type="button"
          onClick={() => setStep(0)}
          className="rounded-xl border border-ink/15 px-3 py-1.5 text-xs text-fg-secondary"
        >
          취소
        </button>
      </div>
    </form>
  );
}
