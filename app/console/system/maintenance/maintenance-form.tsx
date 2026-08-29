'use client';

// 유지보수 모드 — 스위치와 안내 문구를 한 폼으로 묶었다.
//
// 따로 두면 "켜 놓고 문구는 비어 있는" 상태가 만들어진다. 그 상태로 이용자가 보는 건
// 아무 설명 없는 빈 점검 화면이다. 그래서 켜기와 문구를 같이 저장하게 하고,
// 켜기 전에 실제로 보일 화면을 미리 보여 준다.
import { useActionState, useState } from 'react';
import { saveMaintenance, type MaintenanceFormState } from '@/app/lib/actions/admin-system';
import { FIELD, FOCUS, Callout } from '../../ui';

const initial: MaintenanceFormState = {};

export default function MaintenanceForm({
  enabled: initialEnabled,
  message: initialMessage,
  eta: initialEta,
}: {
  enabled: boolean;
  message: string;
  eta: string;
}) {
  const [state, formAction, pending] = useActionState(saveMaintenance, initial);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState(initialMessage);
  const [eta, setEta] = useState(initialEta);
  const [confirming, setConfirming] = useState(false);

  const turningOn = enabled && !initialEnabled;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <form action={formAction} className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-5" onSubmit={() => setConfirming(false)}>
        <input type="hidden" name="enabled" value={String(enabled)} />

        <div className="flex items-start gap-4">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={`유지보수 모드 ${enabled ? '켬' : '끔'}`}
            onClick={() => {
              setEnabled((v) => !v);
              setConfirming(false);
            }}
            className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${FOCUS} ${
              enabled ? 'bg-rose-600' : 'bg-ink/20'
            }`}
          >
            <span
              aria-hidden
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow transition-colors ${
                enabled ? 'left-[1.625rem]' : 'left-0.5'
              }`}
            />
          </button>
          <div className="min-w-0">
            <p className="font-semibold text-fg">유지보수 모드 {enabled ? '켬' : '끔'}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-secondary">
              켜면 일반 이용자에게는 점검 안내 화면만 보입니다. 콘솔 권한이 있는 계정은 그대로 서비스에 접속할 수
              있으므로, 켠 채로 확인 작업을 이어갈 수 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="mt-message" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              점검 안내 문구
            </label>
            <textarea
              id="mt-message"
              name="message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="예: 데이터베이스 점검 중입니다. 15:00까지 완료 예정입니다."
              className={FIELD}
            />
            <p className="mt-1 text-[11px] text-fg-muted">
              언제 끝나는지를 함께 적어 두면 같은 내용의 문의가 눈에 띄게 줄어듭니다.
            </p>
          </div>

          <div>
            <label htmlFor="mt-eta" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              예상 종료 시각 (선택)
            </label>
            <input
              id="mt-eta"
              name="eta"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              placeholder="2026-08-18 15:00 KST"
              className={FIELD}
            />
          </div>
        </div>

        {state.error && <p className="mt-3 text-xs text-rose-600">{state.error}</p>}
        {state.saved && <p className="mt-3 text-xs text-emerald-700">저장되었습니다.</p>}

        <div className="mt-5 flex items-center gap-2">
          {turningOn && !confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            >
              유지보수 모드 켜기
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending}
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                confirming ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-600 hover:bg-brand-500'
              }`}
            >
              {pending ? '적용 중…' : confirming ? '확인 · 지금 켜기' : '저장'}
            </button>
          )}
          {confirming && (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-xl border border-hairline px-4 py-2 text-sm text-fg-secondary"
            >
              취소
            </button>
          )}
        </div>

        {confirming && (
          <div className="mt-3">
            <Callout tone="danger" title="지금 전체 서비스가 점검 화면으로 바뀝니다">
              로그인하지 않은 방문자와 일반 회원 전원에게 오른쪽 미리보기 화면만 보입니다. 진행 중인 작업(작성 중인
              글, 풀던 문제)은 저장되지 않을 수 있습니다.
            </Callout>
          </div>
        )}
      </form>

      {/* 이용자에게 실제로 보일 화면 */}
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">이용자에게 보이는 화면</p>
        <div className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-paper">
          <div className="flex items-center gap-1.5 border-b border-hairline bg-surface px-3 py-2">
            <span aria-hidden className="h-2 w-2 rounded-full bg-rose-400" />
            <span aria-hidden className="h-2 w-2 rounded-full bg-amber-400" />
            <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400" />
          </div>
          <div className="grid min-h-[16rem] place-items-center px-6 py-10 text-center">
            <div>
              <p aria-hidden className="text-3xl">🛠️</p>
              <p className="mt-3 text-lg font-bold text-fg">점검 중입니다</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg-secondary">
                {message || '(안내 문구를 입력하세요)'}
              </p>
              {eta && <p className="mt-3 font-mono text-xs text-fg-muted">종료 예정 · {eta}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
