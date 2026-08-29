'use client';

// 만료 데이터 정리 — 표가 조용히 자라는 것을 막는 버튼.
//
// 레이트리밋 카운터·AI 사용량·채점 세션·인증 코드·가입 초안은 모두 수명이 있는 데이터인데,
// 지우는 코드는 있어도 부르는 곳이 없었다. cron을 걸 수 없는 배포라(OpenNext worker에는
// scheduled 핸들러가 없다) 당분간 여기서 손으로 돌린다.
//
// 특히 가입 초안에는 암호화된 비밀번호가 들어 있다 — 오래 둘수록 얻는 것 없이 위험만 는다.
import { useActionState } from 'react';
import { sweepExpiredData, type SweepState } from '@/app/lib/actions/admin-system';

const initial: SweepState = {};

export default function SweepPanel() {
  const [state, formAction, pending] = useActionState(async () => sweepExpiredData(), initial);

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">만료 데이터 정리</h3>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
        수명이 지난 레이트리밋 카운터·AI 사용량·채점 세션·이메일 인증 코드·가입 초안을 지웁니다. 진행 중인
        이용자에게는 영향이 없습니다.
      </p>
      <form action={formAction} className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-hairline px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:border-signal hover:text-signal disabled:opacity-50"
        >
          {pending ? '정리 중…' : '지금 정리'}
        </button>
      </form>
      {state.message && <p className="mt-2 text-xs text-emerald-700">{state.message}</p>}
      {state.error && <p className="mt-2 text-xs text-rose-700">{state.error}</p>}
    </div>
  );
}
