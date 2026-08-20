'use client';

// 런타임 설정 한 줄 — 값을 바꾸면 서비스 동작이 즉시 달라진다.
//
// 저장 버튼을 값마다 따로 둔 이유: 한 폼에 전부 묶어 두면 "한 개만 고치려다 다른 값도 같이
// 반영되는" 사고가 난다. 설정 화면에서 그건 장애로 직결된다.
import { useActionState, useState } from 'react';
import { updateSetting, type SettingFormState } from '@/app/lib/actions/admin-system';
import type { SettingDef } from '@/app/lib/settings';
import { FIELD, FOCUS } from '../ui';

const initial: SettingFormState = {};

export default function SettingRow({
  def,
  value,
  overridden,
}: {
  def: SettingDef;
  value: boolean | number | string;
  overridden: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateSetting, initial);
  const [draft, setDraft] = useState<string>(String(value));
  const [confirming, setConfirming] = useState(false);

  const current = String(value);
  const dirty = draft !== current;
  // danger 설정은 한 번 더 묻는다 — 전체 서비스를 내리는 스위치가 클릭 한 번에 넘어가면 안 된다
  const needsConfirm = def.danger && dirty;

  return (
    <div className={`px-5 py-4 ${overridden ? 'bg-amber-50/30' : ''}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{def.label}</p>
            {def.danger && (
              <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rose-700">
                주의
              </span>
            )}
            {overridden && (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-800">
                기본값 아님
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fg-secondary">{def.description}</p>
          <p className="mt-1 font-mono text-[10px] text-fg-quiet">
            {def.key} · 기본값 {formatValue(def, def.default)}
          </p>
        </div>

        <form
          action={formAction}
          className="flex shrink-0 flex-wrap items-center gap-2 lg:w-[22rem] lg:justify-end"
          onSubmit={() => setConfirming(false)}
        >
          <input type="hidden" name="key" value={def.key} />

          {def.valueType === 'boolean' ? (
            <>
              <input type="hidden" name="value" value={draft} />
              <button
                type="button"
                role="switch"
                aria-checked={draft === 'true'}
                aria-label={`${def.label} ${draft === 'true' ? '켬' : '끔'}`}
                onClick={() => setDraft(draft === 'true' ? 'false' : 'true')}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${FOCUS} ${
                  draft === 'true' ? 'bg-emerald-600' : 'bg-ink/20'
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-colors ${
                    draft === 'true' ? 'left-[1.375rem]' : 'left-0.5'
                  }`}
                />
              </button>
              <span className="w-8 font-mono text-[11px] text-fg-secondary">{draft === 'true' ? '켬' : '끔'}</span>
            </>
          ) : def.valueType === 'enum' ? (
            <select
              name="value"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={`${FIELD} lg:max-w-[15rem]`}
            >
              {def.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : def.valueType === 'number' ? (
            <input
              type="number"
              name="value"
              value={draft}
              min={def.min}
              max={def.max}
              onChange={(e) => setDraft(e.target.value)}
              className={`${FIELD} lg:w-32`}
            />
          ) : def.valueType === 'text' ? (
            <textarea
              name="value"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="(비우면 표시하지 않음)"
              className={`${FIELD} lg:w-[15rem]`}
            />
          ) : (
            <input
              name="value"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={`${FIELD} lg:w-[15rem]`}
            />
          )}

          {needsConfirm && !confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="shrink-0 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              변경
            </button>
          ) : (
            <button
              type="submit"
              disabled={!dirty || pending}
              className="shrink-0 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-40"
            >
              {pending ? '저장 중…' : confirming ? '확인 · 적용' : '저장'}
            </button>
          )}
          {confirming && (
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setDraft(current);
              }}
              className="shrink-0 rounded-xl border border-ink/15 px-3 py-1.5 text-xs text-fg-secondary"
            >
              취소
            </button>
          )}
        </form>
      </div>

      {confirming && (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-800">
          이 설정은 서비스 동작을 즉시 바꿉니다. <strong>{formatValue(def, current)}</strong> →{' '}
          <strong>{formatValue(def, draft)}</strong> 로 적용할까요?
        </p>
      )}
      {state.error && <p className="mt-2 text-xs text-rose-600">{state.error}</p>}
      {state.saved && !dirty && <p className="mt-2 text-xs text-emerald-700">저장되었습니다.</p>}
    </div>
  );
}

function formatValue(def: SettingDef, value: unknown): string {
  const raw = String(value);
  if (def.valueType === 'boolean') return raw === 'true' ? '켬' : '끔';
  if (def.valueType === 'enum') return def.options?.find((o) => o.value === raw)?.label ?? raw;
  if (raw === '') return '(비움)';
  return raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
}
