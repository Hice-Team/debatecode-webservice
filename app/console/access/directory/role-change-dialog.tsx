'use client';

// 역할 변경 — 확인 단계가 있는 2스텝 플로우.
//
// 이전에는 드롭다운 + [적용] 한 번으로 끝났다. 문제가 둘 있었다:
//   1) "검토자로 올린다"가 실제로 무슨 권한을 주는지 화면 어디에도 없었다
//   2) 왜 바꿨는지가 남지 않아, 나중에 되돌릴 근거가 없었다
// 그래서 ① 역할 선택 → 권한 변화 미리보기 → ② 사유 입력 → 적용 순으로 만들었다.
import { useActionState, useState } from 'react';
import { changeUserRole, type AccessFormState } from '@/app/lib/actions/admin-access';
import { rolePermissionDiff } from '@/app/lib/permissions';
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, roleLabel, type Role } from '@/app/lib/roles';
import { FIELD, FOCUS } from '../../ui';

const initial: AccessFormState = {};

interface Target {
  id: string;
  name: string;
  role: string;
}

export default function RoleChangeDialog({ targets, onClose }: { targets: Target[]; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(changeUserRole, initial);
  const single = targets.length === 1 ? targets[0] : null;
  const [nextRole, setNextRole] = useState<Role>((single?.role as Role) ?? 'user');
  const [reason, setReason] = useState('');

  // 여러 명을 한 번에 바꿀 때는 출발 역할이 제각각이라, 가장 흔한 역할을 기준으로 보여 준다
  const fromRole = single?.role ?? mostCommonRole(targets);
  const diff = rolePermissionDiff(fromRole, nextRole);
  const unchanged = single ? nextRole === single.role : false;

  if (state.saved) {
    return (
      <Shell title="역할 변경 완료" onClose={onClose}>
        <p className="px-6 py-6 text-sm text-emerald-800">{state.saved}</p>
        <Footer>
          <button type="button" onClick={onClose} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
            닫기
          </button>
        </Footer>
      </Shell>
    );
  }

  return (
    <Shell
      title={single ? `역할 변경 — ${single.name}` : `역할 일괄 변경 — ${targets.length}명`}
      onClose={onClose}
    >
      <form action={formAction}>
        <input type="hidden" name="userIds" value={targets.map((t) => t.id).join(',')} />

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          {!single && (
            <div className="rounded-xl border border-hairline bg-paper/50 px-3 py-2.5">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted">대상</p>
              <p className="text-xs leading-relaxed text-fg">
                {targets
                  .slice(0, 8)
                  .map((t) => `${t.name}(${roleLabel(t.role)})`)
                  .join(', ')}
                {targets.length > 8 && ` 외 ${targets.length - 8}명`}
              </p>
            </div>
          )}

          <fieldset>
            <legend className="mb-2 font-mono text-xs tracking-wider text-fg-secondary">변경할 역할</legend>
            <div className="space-y-1.5">
              {ROLES.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                    nextRole === r ? 'border-signal bg-brand-50/50' : 'border-hairline hover:border-ink/25'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={nextRole === r}
                    onChange={() => setNextRole(r)}
                    className="mt-0.5 h-4 w-4 accent-[#1800AC]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">{ROLE_LABELS[r]}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">
                      {ROLE_DESCRIPTIONS[r]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 권한 변화 미리보기 — 역할 이름만으로는 알 수 없는 것을 보여 준다 */}
          {!unchanged && (diff.gained.length > 0 || diff.lost.length > 0) && (
            <div className="rounded-xl border border-hairline bg-paper/40 p-3.5">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                이 변경으로 달라지는 권한
              </p>
              {diff.gained.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1 text-[11px] font-semibold text-emerald-700">+ 새로 얻는 권한</p>
                  <div className="flex flex-wrap gap-1">
                    {diff.gained.map((p) => (
                      <span key={p} className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {diff.lost.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-rose-700">− 잃는 권한</p>
                  <div className="flex flex-wrap gap-1">
                    {diff.lost.map((p) => (
                      <span key={p} className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-800">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {unchanged && (
            <p className="rounded-xl border border-hairline bg-paper/40 px-3 py-2.5 text-[11px] text-fg-muted">
              현재와 같은 역할입니다. 다른 역할을 선택하세요.
            </p>
          )}

          <div>
            <label htmlFor="role-reason" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              변경 사유 (필수)
            </label>
            <input
              id="role-reason"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={4}
              placeholder="예: 운영팀 합류 / 활동 중단으로 권한 회수"
              className={FIELD}
            />
            <p className="mt-1 text-[11px] text-fg-muted">
              감사 로그에 그대로 남습니다. 나중에 이 변경을 설명해야 할 사람이 읽습니다.
            </p>
          </div>

          {state.error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{state.error}</p>
          )}
        </div>

        <Footer>
          <button type="button" onClick={onClose} className={`rounded-xl border border-hairline px-4 py-2 text-sm text-fg-secondary ${FOCUS}`}>
            취소
          </button>
          <button
            type="submit"
            disabled={pending || unchanged || reason.trim().length < 4}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40"
          >
            {pending ? '적용 중…' : `${ROLE_LABELS[nextRole]}(으)로 변경`}
          </button>
        </Footer>
      </form>
    </Shell>
  );
}

function mostCommonRole(targets: Target[]): string {
  const counts = new Map<string, number>();
  targets.forEach((t) => counts.set(t.role, (counts.get(t.role) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'user';
}

/* ---------- 모달 뼈대 ---------- */

export function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-[min(34rem,100%)] overflow-hidden rounded-[var(--radius-panel)] bg-surface shadow-2xl shadow-black/30"
      >
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <h3 className="text-lg font-bold text-fg">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-7 w-7 place-items-center rounded-full text-fg-muted hover:bg-paper"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-hairline bg-paper/40 px-6 py-4">{children}</div>
  );
}
