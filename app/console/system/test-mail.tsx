'use client';

// 테스트 메일 — 설정이 아니라 "실제로 도착하는가"를 확인하는 버튼.
//
// 배포 직후 가장 조용히 실패하는 게 메일이다. 헬스체크는 키가 꽂혀 있으면 초록불을 주는데,
// 앱 비밀번호 만료·발신 주소 불일치·스팸 분류는 전부 그 초록불 아래에서 벌어진다.
import { useActionState } from 'react';
import { sendTestMail, type TestMailState } from '@/app/lib/actions/admin-system';

const initial: TestMailState = {};

export default function TestMail({ defaultTo }: { defaultTo: string }) {
  const [state, formAction, pending] = useActionState(sendTestMail, initial);

  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">메일 도달 확인</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft/55">
        지금 설정된 전송 수단으로 실제 한 통을 보냅니다. <strong>스팸함까지</strong> 확인하세요 — 받은편지함에
        오지 않으면 발신 계정의 SPF/DKIM부터 봐야 합니다.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="test-mail-to" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
            받는 주소
          </label>
          <input
            id="test-mail-to"
            name="to"
            type="email"
            defaultValue={defaultTo}
            className="w-full rounded-lg border border-ink/15 bg-paper/50 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
        >
          {pending ? '보내는 중…' : '테스트 발송'}
        </button>
      </form>
      {state.ok && (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {state.ok}
        </p>
      )}
      {state.error && (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {state.error}
        </p>
      )}
    </div>
  );
}
