'use client';

// 운영자 포인트 수동 지급·차감.
//
// 필요한 상황이 실제로 있다: 상점 발급이 실패했는데 환불이 안 나갔을 때, 이벤트 보상을 줄 때,
// 잘못 지급된 포인트를 되돌릴 때. 이런 건 정해진 규칙으로 자동화할 수 없어서 사람이 판단한다.
//
// 대신 사유를 필수로 받고 감사 로그에 남긴다 — 원장은 정산의 근거라, 출처 없는 숫자가
// 섞이면 나중에 맞는지 확인할 수 없다.
import { useActionState, useMemo, useState } from 'react';
import { adjustPoints, type PointGrantState } from '@/app/lib/actions/admin-points';
import { FIELD, FOCUS, Callout } from '../ui';

const initial: PointGrantState = {};

export interface GrantTarget {
  id: string;
  name: string;
  role: string;
  balance: number;
}

const PRESETS = [
  { amount: 1000, label: '+1,000P' },
  { amount: 5000, label: '+5,000P' },
  { amount: 10000, label: '+10,000P' },
];

export default function PointGrantForm({ targets }: { targets: GrantTarget[] }) {
  const [state, formAction, pending] = useActionState(adjustPoints, initial);
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return targets.slice(0, 50);
    return targets
      .filter((t) => t.name.toLowerCase().includes(needle) || t.role.toLowerCase().includes(needle))
      .slice(0, 50);
  }, [targets, query]);

  const selected = targets.find((t) => t.id === userId) ?? null;
  const numeric = Number(amount);
  const valid = Number.isFinite(numeric) && numeric !== 0;
  const after = selected && valid ? selected.balance + Math.trunc(numeric) : null;
  const ready = Boolean(userId) && valid && memo.trim().length >= 4 && (after == null || after >= 0);

  return (
    <form action={formAction} className="space-y-4 rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
      <input type="hidden" name="userId" value={userId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="grant-search" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
            대상 계정
          </label>
          <input
            id="grant-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·역할로 찾기"
            className={`${FIELD} mb-2`}
          />
          <div className="max-h-48 divide-y divide-ink/5 overflow-y-auto rounded-xl border border-hairline">
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-fg-muted">해당하는 계정이 없습니다.</p>
            )}
            {filtered.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  userId === t.id ? 'bg-brand-50/60' : 'hover:bg-paper/60'
                }`}
              >
                <input
                  type="radio"
                  name="targetPick"
                  checked={userId === t.id}
                  onChange={() => setUserId(t.id)}
                  className="h-4 w-4 accent-[#1800AC]"
                />
                <span className="min-w-0 flex-1 truncate text-ink">{t.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-fg-muted">{t.role}</span>
                <span className="shrink-0 font-mono text-[11px] text-fg-secondary">
                  {t.balance.toLocaleString()}P
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="grant-amount" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              포인트 (음수면 차감)
            </label>
            <input
              id="grant-amount"
              name="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="예: 5000 또는 -3000"
              className={FIELD}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.amount}
                  type="button"
                  onClick={() => setAmount(String(p.amount))}
                  className={`rounded-lg border border-ink/15 px-2.5 py-1 text-[11px] text-fg-secondary hover:border-brand-300 hover:text-brand-700 ${FOCUS}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="grant-memo" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              사유 (필수 · 원장에 그대로 남습니다)
            </label>
            <input
              id="grant-memo"
              name="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 쿠폰 발급 실패 건 환급 / 8월 이벤트 보상"
              className={FIELD}
            />
          </div>

          {selected && valid && (
            <div className="rounded-xl border border-hairline bg-paper/40 px-3 py-2.5 text-xs">
              <p className="text-fg-secondary">
                <strong className="text-ink">{selected.name}</strong> · {selected.balance.toLocaleString()}P →{' '}
                <strong className={after != null && after < 0 ? 'text-rose-600' : 'text-ink'}>
                  {after?.toLocaleString()}P
                </strong>
              </p>
              {after != null && after < 0 && (
                <p className="mt-1 text-rose-600">잔액이 음수가 됩니다. 차감 폭을 줄이세요.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{state.error}</p>
      )}
      {state.saved && (
        <Callout tone="ok" title="반영되었습니다">
          {state.saved}
        </Callout>
      )}

      <button
        type="submit"
        disabled={!ready || pending}
        className={`rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40 ${FOCUS}`}
      >
        {pending ? '반영 중…' : '포인트 반영'}
      </button>
    </form>
  );
}
