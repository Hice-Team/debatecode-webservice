'use client';

// 시즌 · 랭킹 조작 버튼들 — 되돌리기 어려운 동작이라 전부 확인을 한 번 받는다.
//
// 확인 문구에 "무엇이 바뀌고 무엇은 그대로인지"를 적어 둔다. 시즌 초기화와 랭킹 초기화를
// 헷갈려 누르는 것이 이 화면에서 가장 위험한 실수다.
import { useState, useTransition } from 'react';
import {
  clearRankingFloor,
  resetAllRankings,
  resetSeasonNumbering,
  resetUserRanking,
  setSeasonNumber,
  undoUserRankingReset,
  type SeasonActionState,
} from '@/app/lib/actions/admin-seasons';
import { BTN_DANGER, BTN_NEUTRAL, BTN_PRIMARY, FIELD } from '../ui';

function Result({ state }: { state: SeasonActionState | null }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-xs text-rose-600">
        {state.error}
      </p>
    );
  }
  return (
    <p role="status" className="mt-2 text-xs text-emerald-700">
      {state.ok}
    </p>
  );
}

export function SeasonNumberForm({ currentIndex }: { currentIndex: number }) {
  const [state, setState] = useState<SeasonActionState | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <form
        action={(formData) => {
          setState(null);
          startTransition(async () => setState(await setSeasonNumber(formData)));
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor="season-index" className="text-sm text-fg-secondary">
          시즌 번호
        </label>
        <input
          id="season-index"
          name="index"
          type="number"
          min={1}
          max={9999}
          defaultValue={currentIndex}
          className={`${FIELD} w-24`}
        />
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? '적용 중…' : '이 번호로 변경'}
        </button>
        <button
          type="button"
          disabled={pending}
          className={BTN_NEUTRAL}
          onClick={() => {
            if (!confirm('오늘부터 시즌 1로 다시 셉니다.\n순위(랭킹)는 지워지지 않습니다. 계속할까요?')) return;
            setState(null);
            startTransition(async () => setState(await resetSeasonNumbering()));
          }}
        >
          시즌 1로 초기화
        </button>
      </form>
      <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">
        번호를 바꾸면 <strong>오늘이 그 시즌의 첫날</strong>이 됩니다. 순위는 건드리지 않습니다.
      </p>
      <Result state={state} />
    </div>
  );
}

export function RankingResetForm({ floor }: { floor: string | null }) {
  const [state, setState] = useState<SeasonActionState | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={BTN_DANGER}
          onClick={() => {
            if (
              !confirm(
                '지금 이전의 모든 활동을 랭킹 집계에서 제외합니다.\n' +
                  '모든 이용자의 순위가 0에서 다시 시작합니다.\n\n' +
                  '활동 기록(제출·게시글)은 지워지지 않으며, 이 화면에서 되돌릴 수 있습니다. 계속할까요?',
              )
            )
              return;
            setState(null);
            startTransition(async () => setState(await resetAllRankings()));
          }}
        >
          전체 랭킹 초기화
        </button>

        {floor && (
          <button
            type="button"
            disabled={pending}
            className={BTN_NEUTRAL}
            onClick={() => {
              setState(null);
              startTransition(async () => setState(await clearRankingFloor()));
            }}
          >
            초기화 해제 (전체 기록으로)
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">
        {floor ? (
          <>
            현재 <strong>{new Date(floor).toLocaleString('ko-KR')}</strong> 이후 활동만 셉니다.
          </>
        ) : (
          '현재 제한 없음 — 전체 기록으로 집계합니다.'
        )}
      </p>
      <Result state={state} />
    </div>
  );
}

export function UserResetForm() {
  const [state, setState] = useState<SeasonActionState | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        setState(null);
        startTransition(async () => {
          const result = await resetUserRanking(formData);
          setState(result);
        });
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap gap-2">
        <input name="query" placeholder="이메일 또는 이름" className={`${FIELD} min-w-[14rem] flex-1`} />
        <input name="reason" placeholder="사유 (예: 제출 로그 조작 확인)" className={`${FIELD} min-w-[16rem] flex-[2]`} />
        <button type="submit" disabled={pending} className={BTN_DANGER}>
          {pending ? '처리 중…' : '이 계정 랭킹 초기화'}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function UndoResetButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await undoUserRankingReset(formData);
        });
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={BTN_NEUTRAL}>
        {pending ? '취소 중…' : '취소'}
      </button>
    </form>
  );
}
