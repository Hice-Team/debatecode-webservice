'use client';

// 회원 디렉터리 — 검색·필터·선택, 그리고 역할 변경/제재로 넘어가는 진입점.
//
// 예전 화면과의 차이: 표 안에서 드롭다운을 바꾸고 [적용]을 누르면 즉시 권한이 바뀌었다.
// 사유도 확인도 없었고, 무엇이 달라지는지도 보이지 않았다. 여기서는 표는 "고르는 곳"이고
// 실제 변경은 확인 단계가 있는 모달에서 일어난다.
import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ROLES, ROLE_BADGE, ROLE_LABELS, roleLabel, type Role } from '@/app/lib/roles';
import { sanctionTypeLabel } from '@/app/lib/sanctions';
import { FOCUS, FIELD, BTN_NEUTRAL, BTN_DANGER } from '../../ui';
import RoleChangeDialog from './role-change-dialog';
import SanctionDialog from '../sanctions/sanction-dialog';

export interface DirectoryUser {
  id: string;
  name: string; // 마스킹된 이름
  provider: string;
  role: string;
  createdAt: string;
  submissions: number;
  posts: number;
  /** 활성 제재 요약 */
  activeSanctions: { id: string; type: string; expiresAt: string | null }[];
  pastSanctionCount: number;
  /** 개별 권한 오버라이드 수 */
  overrides: number;
}

export default function DirectoryTable({
  users,
  currentUserId,
  canGrantRole,
  canIssueSanction,
  initialRole,
}: {
  users: DirectoryUser[];
  currentUserId: string;
  canGrantRole: boolean;
  canIssueSanction: boolean;
  initialRole: string;
}) {
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState(initialRole);
  const [status, setStatus] = useState<'all' | 'sanctioned' | 'override'>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roleTarget, setRoleTarget] = useState<DirectoryUser[] | null>(null);
  const [sanctionTarget, setSanctionTarget] = useState<DirectoryUser | null>(null);
  const searchId = useId();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (status === 'sanctioned' && u.activeSanctions.length === 0) return false;
      if (status === 'override' && u.overrides === 0) return false;
      if (!needle) return true;
      return u.name.toLowerCase().includes(needle) || u.provider.toLowerCase().includes(needle);
    });
  }, [users, q, roleFilter, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const selectedUsers = users.filter((u) => selected.has(u.id) && u.id !== currentUserId);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // "모두 선택"은 화면에 보이는 페이지에만 적용한다 — 300명이 조용히 선택되는 사고를 막는다
  const allOnPageSelected = pageItems.length > 0 && pageItems.every((u) => selected.has(u.id));

  return (
    <section>
      {/* 필터 바 */}
      <div className="mb-4 flex flex-col gap-3 rounded-[var(--radius-panel)] border border-hairline bg-surface p-4 lg:flex-row lg:items-center">
        <div role="search" className="flex-1">
          <label htmlFor={searchId} className="sr-only">
            이름·로그인 방식으로 회원 검색
          </label>
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="이름·로그인 방식 검색"
            className={FIELD}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="역할 필터"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className={`rounded-lg border border-hairline bg-surface px-2.5 py-2 text-sm ${FOCUS}`}
          >
            <option value="all">전체 역할</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <select
            aria-label="상태 필터"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
            className={`rounded-lg border border-hairline bg-surface px-2.5 py-2 text-sm ${FOCUS}`}
          >
            <option value="all">전체 상태</option>
            <option value="sanctioned">제재 중</option>
            <option value="override">권한 오버라이드 있음</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">
              회원 목록 — 마스킹된 이름, 로그인 방식, 역할, 활동량, 제재 상태
            </caption>
            <thead>
              <tr className="border-b border-hairline bg-paper/50 font-mono text-[11px] uppercase tracking-wider text-fg-secondary">
                <th scope="col" className="px-3 py-3 text-left font-medium">
                  <input
                    type="checkbox"
                    aria-label="이 페이지 모두 선택"
                    checked={allOnPageSelected}
                    onChange={(e) => {
                      const on = e.currentTarget.checked;
                      setSelected((prev) => {
                        const next = new Set(prev);
                        pageItems.forEach((u) => (on ? next.add(u.id) : next.delete(u.id)));
                        return next;
                      });
                    }}
                    className="h-4 w-4"
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">사용자</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 text-left font-medium">로그인</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">역할</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">상태</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">활동</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <tr key={u.id} className="border-b border-hairline align-top last:border-0 hover:bg-brand-50/20">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`${u.name} 선택`}
                        checked={selected.has(u.id)}
                        disabled={isSelf}
                        onChange={() => toggle(u.id)}
                        className="h-4 w-4 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-bold text-signal ring-1 ring-inset ring-brand-100"
                        >
                          {(u.name?.[0] ?? '?').toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-fg">
                            {u.name}
                            {isSelf && <span className="ml-1.5 font-mono text-[10px] text-brand-600">(나)</span>}
                          </p>
                          <p className="truncate font-mono text-[11px] text-fg-muted">
                            가입 {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-hairline bg-paper px-2 py-0.5 text-[11px] text-fg-secondary">
                        {u.provider}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                          ROLE_BADGE[u.role as Role] ?? ROLE_BADGE.user
                        }`}
                      >
                        {roleLabel(u.role)}
                      </span>
                      {u.overrides > 0 && (
                        <Link
                          href={`/console/access/roles?user=${u.id}`}
                          className="mt-1 block font-mono text-[10px] text-brand-600 hover:underline"
                        >
                          오버라이드 {u.overrides}건
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.activeSanctions.length === 0 ? (
                        <span className="font-mono text-[11px] text-fg-quiet">
                          {u.pastSanctionCount > 0 ? `과거 ${u.pastSanctionCount}건` : '—'}
                        </span>
                      ) : (
                        <div className="space-y-1">
                          {u.activeSanctions.map((s) => (
                            <span
                              key={s.id}
                              className="block w-fit rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] text-rose-700"
                            >
                              {sanctionTypeLabel(s.type)} 제한 ·{' '}
                              {s.expiresAt ? `~${new Date(s.expiresAt).toLocaleDateString('ko-KR')}` : '영구'}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[11px] text-fg-secondary">
                      제출 {u.submissions.toLocaleString()}
                      <br />
                      글 {u.posts.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className="block text-right font-mono text-[11px] text-fg-quiet">본인 제외</span>
                      ) : (
                        <div className="flex justify-end gap-1.5">
                          {canGrantRole && (
                            <button type="button" onClick={() => setRoleTarget([u])} className={BTN_NEUTRAL}>
                              역할
                            </button>
                          )}
                          {canIssueSanction && (
                            <button type="button" onClick={() => setSanctionTarget(u)} className={BTN_DANGER}>
                              제재
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-fg-muted">
                    조건에 맞는 회원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 선택 시 나타나는 일괄 작업 바 */}
        {selectedUsers.length > 0 && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-hairline bg-surface px-4 py-3">
            <p className="font-mono text-sm text-fg-secondary">선택 {selectedUsers.length}명</p>
            <div className="ml-auto flex items-center gap-2">
              {canGrantRole && (
                <button type="button" onClick={() => setRoleTarget(selectedUsers)} className={BTN_NEUTRAL}>
                  역할 일괄 변경
                </button>
              )}
              <button type="button" onClick={() => setSelected(new Set())} className={BTN_NEUTRAL}>
                선택 해제
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-fg-secondary">
            <label htmlFor="per-page" className="font-mono text-[11px]">
              페이지당
            </label>
            <select
              id="per-page"
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value));
                setPage(1);
              }}
              className="rounded border border-hairline bg-surface px-2 py-1 text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span>· 필터 {filtered.length}명 / 전체 {users.length}명</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              className="rounded px-2 py-1 text-sm disabled:opacity-40"
            >
              이전
            </button>
            <span className="font-mono text-sm">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              className="rounded px-2 py-1 text-sm disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
      </div>

      {roleTarget && <RoleChangeDialog targets={roleTarget} onClose={() => setRoleTarget(null)} />}
      {sanctionTarget && (
        <SanctionDialog
          target={{ id: sanctionTarget.id, name: sanctionTarget.name }}
          onClose={() => setSanctionTarget(null)}
        />
      )}
    </section>
  );
}
