'use client';

// 복구 이메일 — 코드 확인을 거쳐야 등록된다.
//
// 예전에는 입력한 문자열을 그대로 저장했다. 그래서 오타가 난 주소를 복구 수단으로 믿고 있다가,
// 정작 계정을 잃었을 때 아무 데도 메일이 가지 않는 상황이 가능했다.
// "받아볼 수 있는 주소"임을 확인한 것만 저장한다.
import { useActionState, useState } from 'react';
import {
  sendVerificationCode,
  confirmRecoveryEmail,
  removeRecoveryEmail,
  type CodeState,
} from '@/app/lib/actions/verification';

const initial: CodeState = {};

const FIELD =
  'w-full rounded-lg border border-ink/15 bg-paper/50 px-4 py-2.5 text-sm placeholder:text-fg-quiet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';

export default function RecoveryEmail({
  current,
  verifiedAt,
}: {
  current: string | null;
  verifiedAt: string | null;
}) {
  const [sendState, sendAction, sending] = useActionState(sendVerificationCode, initial);
  const [confirmState, confirmAction, confirming] = useActionState(confirmRecoveryEmail, initial);
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(!current);

  // 등록돼 있고 편집 중이 아니면 현재 상태만 보여 준다
  if (current && !editing && !confirmState.verified) {
    return (
      <div className="rounded-xl border border-hairline bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold text-ink">복구 이메일</h4>
          {verifiedAt ? (
            <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">
              확인됨
            </span>
          ) : (
            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-800">
              미확인 (예전에 등록된 주소)
            </span>
          )}
        </div>
        <p className="mt-1.5 font-mono text-sm text-fg">{current}</p>
        <p className="mt-1 text-xs text-fg-muted">
          {verifiedAt
            ? `${new Date(verifiedAt).toLocaleDateString('ko-KR')}에 확인했습니다. 가입 이메일에 접근할 수 없을 때 이 주소로 복구를 안내합니다.`
            : '코드 확인을 거치지 않은 주소입니다. 실제로 받아볼 수 있는지 확인해 주세요.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEmail(current);
              setEditing(true);
            }}
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg hover:border-ink/40"
          >
            {verifiedAt ? '주소 변경' : '지금 확인하기'}
          </button>
          <form action={removeRecoveryEmail}>
            <button className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg-secondary hover:border-rose-300 hover:text-rose-700">
              해제
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (confirmState.verified) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-900">복구 이메일이 등록되었습니다.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 text-xs text-emerald-800 underline underline-offset-2"
        >
          새로고침
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-white p-4">
      <h4 className="font-semibold text-ink">복구 이메일 (선택)</h4>
      <p className="mt-1 text-xs leading-relaxed text-fg-secondary">
        가입 이메일에 접근할 수 없을 때 복구 안내를 받을 주소입니다. 가입 이메일과 <strong>다른</strong> 주소를
        등록하세요.
      </p>

      {/* 1단계 — 코드 보내기 */}
      <form action={sendAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="purpose" value="recovery_email" />
        <div className="min-w-0 flex-1">
          <label htmlFor="recovery-email" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
            복구 이메일 주소
          </label>
          <input
            id="recovery-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="recovery@example.com"
            className={FIELD}
          />
        </div>
        <button
          type="submit"
          disabled={sending || !email.includes('@')}
          className="shrink-0 rounded-lg bg-signal px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
        >
          {sending ? '전송 중…' : '인증 코드 보내기'}
        </button>
      </form>

      {sendState.error && <p className="mt-2 text-xs text-rose-600">{sendState.error}</p>}
      {sendState.notice && (
        <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          {sendState.notice}
        </p>
      )}

      {/* 2단계 — 코드 확인 */}
      {sendState.sent && (
        <form action={confirmAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-hairline pt-3">
          <input type="hidden" name="email" value={email} />
          <div className="min-w-0 flex-1">
            <label htmlFor="recovery-code" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              메일로 받은 6자리 코드
            </label>
            <input
              id="recovery-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              placeholder="000000"
              className={`${FIELD} font-mono tracking-[0.4em]`}
            />
          </div>
          <button
            type="submit"
            disabled={confirming}
            className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
          >
            {confirming ? '확인 중…' : '확인하고 등록'}
          </button>
        </form>
      )}

      {confirmState.error && <p className="mt-2 text-xs text-rose-600">{confirmState.error}</p>}

      {current && (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-3 text-xs text-fg-muted underline underline-offset-2 hover:text-ink"
        >
          취소
        </button>
      )}
    </div>
  );
}
