'use client';

// 회원 및 권한 관리 — 개인정보 최소화(마스킹 이름·로그인 방식만) + 검색/필터.
// 관리 도구: 역할 지정(관리자/메이트 포함), 제재(팝업 모달).
import { useId, useMemo, useState } from 'react';
import { setUserRole, issueSanction, liftSanction, setMultipleUserRoles, issueSanctionBatch } from '@/app/lib/actions/admin';
import { ROLES, ROLE_BADGE, ROLE_LABELS, roleLabel, type Role } from '@/app/lib/roles';

export interface ConsoleUser {
  id: string;
  name: string; // 마스킹된 이름 (예: 강*호)
  provider: string; // 로그인 방식 라벨 (예: 구글)
  role: string;
  createdAt: string;
  submissions: number;
  sanctions: { id: string; type: string; reason: string; expiresAt: string | null; active: boolean; createdAt: string }[];
}

const SANCTION_LABEL: Record<string, string> = { read: '열람', post: '글작성', comment: '답글' };
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';

/* ---------- 제재 팝업 모달 ---------- */

function SanctionModal({ target, onClose }: { target: ConsoleUser; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sanction-title"
        className="relative w-[min(26rem,100%)] rounded-2xl bg-white shadow-2xl shadow-black/30 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="border-b border-ink/10 px-6 py-4">
          <h3 id="sanction-title" className="text-lg font-bold text-ink">제재 부여 — {target.name}</h3>
          <p className="mt-0.5 text-xs text-ink-soft/60">유형과 기간을 선택하세요. 이력은 해제 후에도 기록으로 남습니다.</p>
        </div>
        <form action={issueSanction} className="space-y-4 px-6 py-5" onSubmit={() => onClose()}>
          <input type="hidden" name="userId" value={target.id} />
          <div>
            <label htmlFor="sanction-type" className="block font-mono text-xs text-ink-soft/60 tracking-wider mb-1.5">제재 유형</label>
            <select id="sanction-type" name="type" className={`w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm ${FOCUS}`}>
              <option value="post">글 작성 불가</option>
              <option value="comment">답글 작성 불가</option>
              <option value="read">열람 불가</option>
            </select>
          </div>
          <div>
            <label htmlFor="sanction-days" className="block font-mono text-xs text-ink-soft/60 tracking-wider mb-1.5">기간</label>
            <select id="sanction-days" name="days" className={`w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm ${FOCUS}`}>
              <option value="1">1일</option>
              <option value="3">3일</option>
              <option value="7">7일</option>
              <option value="30">30일</option>
              <option value="0">영구</option>
            </select>
          </div>
          <div>
            <label htmlFor="sanction-reason" className="block font-mono text-xs text-ink-soft/60 tracking-wider mb-1.5">사유</label>
            <input
              id="sanction-reason"
              name="reason"
              required
              placeholder="예: 커뮤니티 가이드라인 위반 (욕설)"
              className={`w-full rounded-lg border border-ink/15 bg-paper/40 px-3 py-2 text-sm placeholder:text-ink-soft/40 ${FOCUS}`}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={`rounded-xl border border-ink/15 px-4 py-2 text-sm text-ink-soft/70 hover:border-ink/40 ${FOCUS}`}>
              취소
            </button>
            <button type="submit" className={`rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 ${FOCUS}`}>
              제재 적용
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- 제재 이력 모달 ---------- */

function HistoryModal({ target, onClose }: { target: ConsoleUser; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="history-title" className="relative w-[min(30rem,100%)] rounded-2xl bg-white shadow-2xl shadow-black/30 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h3 id="history-title" className="text-lg font-bold text-ink">제재 이력 — {target.name}</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className={`flex h-7 w-7 items-center justify-center rounded-full text-ink-soft/50 hover:bg-ink/5 ${FOCUS}`}>✕</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {target.sanctions.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-soft/55">제재 이력이 없습니다.</p>
          ) : (
            <ul className="space-y-2.5">
              {target.sanctions.map((s) => (
                <li key={s.id} className="rounded-xl border border-ink/10 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${s.active ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-ink/10 bg-paper text-ink-soft/55'}`}>
                      {SANCTION_LABEL[s.type] ?? s.type}금지
                    </span>
                    <span className={`font-mono text-[10px] ${s.active ? 'text-rose-600' : 'text-ink-soft/50'}`}>{s.active ? '활성' : '해제/만료'}</span>
                    <span className="ml-auto font-mono text-[11px] text-ink-soft/45">
                      {new Date(s.createdAt).toLocaleDateString('ko-KR')} · {s.expiresAt ? `~${new Date(s.expiresAt).toLocaleDateString('ko-KR')}` : '영구'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink-soft/75">{s.reason}</p>
                  {s.active && (
                    <form action={liftSanction} className="mt-2">
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className={`font-mono text-[11px] text-emerald-700 underline underline-offset-2 hover:text-emerald-800 ${FOCUS}`}>이 제재 해제</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- 본체 ---------- */

export default function UserManagement({ users, currentUserId, canGrant }: { users: ConsoleUser[]; currentUserId: string; canGrant: boolean }) {
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [sortBySubmissionsDesc, setSortBySubmissionsDesc] = useState(true);
  const [sanctionTarget, setSanctionTarget] = useState<ConsoleUser | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ConsoleUser | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const anySelected = Object.values(selected).some(Boolean);
  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const searchId = useId();
  const filterId = useId();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!needle) return true;
      return u.name.toLowerCase().includes(needle) || u.provider.toLowerCase().includes(needle);
    });
  }, [users, q, roleFilter]);

  // 정렬 및 페이지 계산
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => (sortBySubmissionsDesc ? b.submissions - a.submissions : a.submissions - b.submissions));
    return arr;
  }, [filtered, sortBySubmissionsDesc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const pageItems = sorted.slice((page - 1) * perPage, page * perPage);

  // 페이지 변경 시 스크롤을 테이블 상단으로 이동
  const gotoPage = (p: number) => {
    setPage(p);
    const el = document.getElementById('members');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="members" aria-labelledby="members-heading" className="scroll-mt-20">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-1" aria-hidden>MEMBERS & ROLES</h2>
          <h3 id="members-heading" className="text-xl font-bold">회원 및 권한 관리</h3>
          <p className="mt-1 text-xs text-ink-soft/55">개인정보 보호를 위해 이름은 마스킹되고 이메일 대신 로그인 방식만 표시됩니다.</p>
        </div>
        <div className="flex items-center gap-2" role="search">
          <label htmlFor={searchId} className="sr-only">이름·로그인 방식으로 회원 검색</label>
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·로그인 방식 검색"
            className={`w-48 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm placeholder:text-ink-soft/45 ${FOCUS}`}
          />
          <label htmlFor={filterId} className="sr-only">역할로 필터</label>
          <select
            id={filterId}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={`rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm ${FOCUS}`}
          >
            <option value="all">전체 역할</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <caption className="sr-only">회원 목록 — 마스킹된 이름, 로그인 방식, 역할, 제재 기록, 제출 수 및 관리 도구</caption>
            <thead>
              <tr className="border-b border-ink/10 bg-paper/50 font-mono text-[11px] uppercase tracking-wider text-ink-soft/60">
                  <th scope="col" className="px-3 py-3 text-left font-medium">
                    <input
                      aria-label="모두 선택"
                      type="checkbox"
                      checked={users.length > 0 && users.every((u) => selected[u.id])}
                      onChange={(e) => {
                        const v = e.currentTarget.checked;
                        const next: Record<string, boolean> = {};
                        users.forEach((u) => (next[u.id] = v));
                        setSelected(next);
                      }}
                      className="h-4 w-4"
                    />
                  </th>
                  <th scope="col" className="px-5 py-3 text-left font-medium">사용자</th>
                <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">로그인 방식</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">역할</th>
                <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">제재 기록</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  <button type="button" onClick={() => { setSortBySubmissionsDesc((v) => !v); setPage(1); }} className="inline-flex items-center gap-2">
                    제출
                    <span className="font-mono text-[11px] text-ink-soft/40">{sortBySubmissionsDesc ? '▼' : '▲'}</span>
                  </button>
                </th>
                <th scope="col" className="px-5 py-3 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((u) => {
                const isSelf = u.id === currentUserId;
                const activeSanctions = u.sanctions.filter((s) => s.active);
                const pastCount = u.sanctions.length - activeSanctions.length;
                return (
                  <tr key={u.id} className="border-b border-ink/5 last:border-0 align-top hover:bg-brand-50/20">
                    <td className="px-3 py-3">
                      <input
                        aria-label={`선택 ${u.name}`}
                        type="checkbox"
                        checked={!!selected[u.id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [u.id]: e.currentTarget.checked }))}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-bold text-signal ring-1 ring-inset ring-brand-100">
                          {(u.name?.[0] ?? '?').toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{u.name}{isSelf && <span className="ml-1.5 font-mono text-[10px] text-brand-600">(나)</span>}</p>
                          <p className="truncate font-mono text-[11px] text-ink-soft/50">가입 {new Date(u.createdAt).toLocaleDateString('ko-KR')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-ink/10 bg-paper px-2 py-0.5 text-[11px] text-ink-soft/70">{u.provider}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] ${ROLE_BADGE[(u.role as Role)] ?? ROLE_BADGE.user}`}>
                        {roleLabel(u.role)}
                      </span>
                      {canGrant && !isSelf && (
                        <form action={setUserRole} className="mt-1.5 flex items-center gap-1">
                          <input type="hidden" name="userId" value={u.id} />
                          <label className="sr-only" htmlFor={`role-${u.id}`}>{u.name}의 역할 변경 (관리자·메이트 지정 포함)</label>
                          <select id={`role-${u.id}`} name="role" defaultValue={u.role} className={`rounded border border-ink/15 bg-white px-1.5 py-1 text-[11px] ${FOCUS}`}>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                          <button type="submit" className={`rounded bg-brand-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-brand-500 ${FOCUS}`}>적용</button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.sanctions.length === 0 ? (
                        <span className="font-mono text-[11px] text-ink-soft/40" aria-label="제재 기록 없음">—</span>
                      ) : (
                        <div className="space-y-1">
                          {activeSanctions.map((s) => (
                            <div key={s.id} className="flex items-center gap-1.5">
                              <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] text-rose-700">
                                {SANCTION_LABEL[s.type] ?? s.type}금지 · {s.expiresAt ? `~${new Date(s.expiresAt).toLocaleDateString('ko-KR')}` : '영구'}
                              </span>
                              <form action={liftSanction}>
                                <input type="hidden" name="id" value={s.id} />
                                <button type="submit" className={`font-mono text-[10px] text-emerald-700 underline underline-offset-2 hover:text-emerald-800 ${FOCUS}`} aria-label={`${u.name}의 ${SANCTION_LABEL[s.type] ?? s.type} 제재 해제`}>해제</button>
                              </form>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setHistoryTarget(u)}
                            className={`inline-block rounded border border-ink/10 bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-soft/60 hover:border-ink/30 ${FOCUS}`}
                            aria-haspopup="dialog"
                          >
                            이력 보기{pastCount > 0 ? ` (과거 ${pastCount})` : ''}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] text-ink-soft/70">{u.submissions.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      {isSelf ? (
                        <span className="block text-right font-mono text-[11px] text-ink-soft/40">본인 제외</span>
                      ) : (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setSanctionTarget(u)}
                            className={`rounded-xl bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-rose-700 ${FOCUS}`}
                            aria-haspopup="dialog"
                          >
                            제재
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-ink-soft/50">검색 결과가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {anySelected && (
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-ink/10 bg-white px-4 py-3">
            <div className="font-mono text-sm text-ink-soft/70">선택 {selectedIds.length}명</div>
            <div className="flex items-center gap-2">
              <form action={setMultipleUserRoles} className="flex items-center gap-2">
                <input type="hidden" name="userIds" value={selectedIds.join(',')} />
                <select name="role" className="rounded border border-ink/15 bg-white px-2 py-1 text-sm">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <button type="submit" className="rounded bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white">일괄 적용</button>
              </form>
              <form action={issueSanctionBatch} className="flex items-center gap-2">
                <input type="hidden" name="userIds" value={selectedIds.join(',')} />
                <select name="type" className="rounded border border-ink/15 bg-white px-2 py-1 text-sm">
                  <option value="post">글 작성 금지</option>
                  <option value="comment">답글 금지</option>
                  <option value="read">열람 금지</option>
                </select>
                <select name="days" className="rounded border border-ink/15 bg-white px-2 py-1 text-sm">
                  <option value={1}>1일</option>
                  <option value={3}>3일</option>
                  <option value={7}>7일</option>
                  <option value={30}>30일</option>
                  <option value={0}>영구</option>
                </select>
                <input name="reason" placeholder="사유 (선택)" className="rounded border border-ink/15 px-2 py-1 text-sm" />
                <button type="submit" className="rounded bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white">제재 적용</button>
              </form>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-ink/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-ink-soft/60">
            <label className="font-mono text-[11px]">페이지당</label>
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); gotoPage(1); }} className="rounded border border-ink/15 bg-white px-2 py-1 text-sm">
              <option value={8}>8</option>
              <option value={12}>12</option>
              <option value={24}>24</option>
            </select>
            <span> · 전체 {sorted.length}명</span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => gotoPage(Math.max(1, page - 1))} disabled={page <= 1} className="rounded px-2 py-1 text-sm disabled:opacity-40">이전</button>
            <span className="font-mono text-sm">{page} / {totalPages}</span>
            <button onClick={() => gotoPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="rounded px-2 py-1 text-sm disabled:opacity-40">다음</button>
          </div>
        </div>
      </div>
      <p className="mt-2 font-mono text-[11px] text-ink-soft/50" aria-live="polite">표시 {pageItems.length} / 필터 {sorted.length} / 전체 {users.length}명</p>

      {sanctionTarget && <SanctionModal target={sanctionTarget} onClose={() => setSanctionTarget(null)} />}
      {historyTarget && <HistoryModal target={historyTarget} onClose={() => setHistoryTarget(null)} />}
    </section>
  );
}
