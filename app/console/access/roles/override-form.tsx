'use client';

// 개별 권한 오버라이드 — 대상 계정과 권한을 **여러 개 동시에** 고른다.
//
// 한 명·한 권한씩만 되던 때는, 운영팀 3명에게 권한 2개를 주려면 같은 폼을 여섯 번 채워야 했다.
// 그 과정에서 사유가 조금씩 달라져 나중에 이력을 읽기 어려워졌다. 한 번에 걸면 사유도 하나로 남는다.
import { useActionState, useMemo, useState } from 'react';
import { setPermissionGrant, type AccessFormState } from '@/app/lib/actions/admin-access';
import {
  PERMISSIONS,
  PERMISSION_GROUP_LABELS,
  ALL_PERMISSIONS,
  type PermissionGroup,
} from '@/app/lib/permissions';
import { FIELD, FOCUS, Callout, BTN_NEUTRAL } from '../../ui';

const initial: AccessFormState = {};

export interface GrantCandidate {
  id: string;
  name: string;
  role: string;
}

const GROUP_ORDER: PermissionGroup[] = ['console', 'queue', 'content', 'access', 'growth', 'system'];

export default function OverrideForm({
  candidates,
  presetUserId,
}: {
  candidates: GrantCandidate[];
  presetUserId?: string;
}) {
  const [state, formAction, pending] = useActionState(setPermissionGrant, initial);
  const [userIds, setUserIds] = useState<string[]>(presetUserId ? [presetUserId] : []);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow');
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.role.toLowerCase().includes(needle),
    );
  }, [candidates, query]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  // 고른 권한 중 민감한 것 — 허용으로 줄 때 경고를 띄운다
  const sensitivePicked = permissions.filter(
    (p) => (PERMISSIONS as Record<string, { sensitive?: boolean }>)[p]?.sensitive,
  );
  const ready = userIds.length > 0 && permissions.length > 0 && reason.trim().length >= 4;

  return (
    <form action={formAction} className="space-y-4 rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
      <input type="hidden" name="userIds" value={userIds.join(',')} />
      <input type="hidden" name="permissions" value={permissions.join(',')} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- 대상 계정 (다중) ---- */}
        <fieldset className="min-w-0">
          <legend className="mb-1.5 font-mono text-xs tracking-wider text-fg-secondary">
            대상 계정 {userIds.length > 0 && <span className="text-signal">· {userIds.length}명 선택</span>}
          </legend>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·역할로 찾기"
            aria-label="계정 검색"
            className={`${FIELD} mb-2`}
          />
          <div className="max-h-56 overflow-y-auto rounded-xl border border-hairline divide-y divide-ink/5">
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-fg-muted">해당하는 계정이 없습니다.</p>
            )}
            {filtered.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  userIds.includes(c.id) ? 'bg-brand-50/60' : 'hover:bg-paper/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={userIds.includes(c.id)}
                  onChange={() => toggle(userIds, setUserIds, c.id)}
                  className="h-4 w-4 accent-[#1800AC]"
                />
                <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-fg-muted">{c.role}</span>
              </label>
            ))}
          </div>
          {userIds.length > 0 && (
            <button
              type="button"
              onClick={() => setUserIds([])}
              className="mt-1.5 font-mono text-[11px] text-fg-muted underline underline-offset-2 hover:text-ink"
            >
              선택 해제
            </button>
          )}
        </fieldset>

        {/* ---- 권한 (다중) ---- */}
        <fieldset className="min-w-0">
          <legend className="mb-1.5 font-mono text-xs tracking-wider text-fg-secondary">
            권한 {permissions.length > 0 && <span className="text-signal">· {permissions.length}개 선택</span>}
          </legend>
          <div className="max-h-[15.5rem] overflow-y-auto rounded-xl border border-hairline">
            {GROUP_ORDER.map((group) => {
              const perms = ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].group === group);
              if (perms.length === 0) return null;
              return (
                <div key={group}>
                  <p className="sticky top-0 bg-paper/90 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-quiet backdrop-blur">
                    {PERMISSION_GROUP_LABELS[group]}
                  </p>
                  {perms.map((p) => {
                    const def = PERMISSIONS[p] as { label: string; description: string; sensitive?: boolean };
                    return (
                      <label
                        key={p}
                        className={`flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors ${
                          permissions.includes(p) ? 'bg-brand-50/60' : 'hover:bg-paper/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={permissions.includes(p)}
                          onChange={() => toggle(permissions, setPermissions, p)}
                          className="mt-0.5 h-4 w-4 accent-[#1800AC]"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm text-ink">
                            {def.label}
                            {def.sensitive && (
                              <span className="rounded border border-rose-200 bg-rose-50 px-1 py-0.5 font-mono text-[9px] text-rose-700">
                                민감
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">
                            {def.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {permissions.length > 0 && (
            <button
              type="button"
              onClick={() => setPermissions([])}
              className="mt-1.5 font-mono text-[11px] text-fg-muted underline underline-offset-2 hover:text-ink"
            >
              선택 해제
            </button>
          )}
        </fieldset>
      </div>

      {/* ---- 방향 · 기간 ---- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_10rem]">
        <fieldset>
          <legend className="mb-1.5 font-mono text-xs tracking-wider text-fg-secondary">방향</legend>
          <div className="flex gap-2">
            {(
              [
                { value: 'allow', label: '허용 추가', desc: '역할에 없는 권한을 이 계정들에만 열어 준다' },
                { value: 'deny', label: '차단', desc: '역할이 주는 권한을 이 계정들에서만 잠근다' },
              ] as const
            ).map((o) => (
              <label
                key={o.value}
                className={`flex flex-1 cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                  effect === o.value
                    ? o.value === 'allow'
                      ? 'border-emerald-400 bg-emerald-50/50'
                      : 'border-rose-400 bg-rose-50/50'
                    : 'border-hairline hover:border-ink/25'
                }`}
              >
                <input
                  type="radio"
                  name="effect"
                  value={o.value}
                  checked={effect === o.value}
                  onChange={() => setEffect(o.value)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{o.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="grant-days" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
            기간
          </label>
          <select id="grant-days" name="days" defaultValue="0" className={FIELD}>
            <option value="0">무기한</option>
            <option value="7">7일</option>
            <option value="30">30일</option>
            <option value="90">90일</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="grant-reason" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
          사유 (필수 · 선택한 전원에게 같은 사유로 기록됩니다)
        </label>
        <input
          id="grant-reason"
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={4}
          required
          placeholder="예: 신고 처리 인력 부족으로 한시 위임 / 오조치 반복으로 제재 권한 잠금"
          className={FIELD}
        />
      </div>

      {sensitivePicked.length > 0 && effect === 'allow' && (
        <Callout tone="warn" title={`민감 권한 ${sensitivePicked.length}개가 포함돼 있습니다`}>
          {sensitivePicked
            .map((p) => (PERMISSIONS as Record<string, { label: string }>)[p].label)
            .join(', ')}
          — 되돌리기 어려운 조치를 가능하게 합니다. 기간을 한정하는 것을 권장합니다.
        </Callout>
      )}
      {state.error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{state.error}</p>
      )}
      {state.saved && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {state.saved}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!ready || pending}
          className={`rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40 ${FOCUS}`}
        >
          {pending
            ? '적용 중…'
            : userIds.length && permissions.length
              ? `${userIds.length}명 × 권한 ${permissions.length}개 적용`
              : '오버라이드 적용'}
        </button>
        {(userIds.length > 0 || permissions.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setUserIds([]);
              setPermissions([]);
            }}
            className={BTN_NEUTRAL}
          >
            전체 초기화
          </button>
        )}
      </div>
    </form>
  );
}
