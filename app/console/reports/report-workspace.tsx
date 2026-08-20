'use client';

// 신고 처리 워크스페이스 — 좌: 케이스 큐 / 우: 상세 + 조치.
//
// 예전 화면은 신고 한 건이 한 줄이고, 버튼은 [처리완료]와 [기각] 둘뿐이었다. 그래서
//   · 같은 글에 대한 신고 5건이 5줄로 흩어졌고
//   · 작성자를 제재하려면 회원 관리로 이동해 사람을 다시 찾아야 했고
//   · "처리완료"가 무엇을 했다는 뜻인지 아무 데도 남지 않았다.
//
// 여기서는 대상별로 묶은 **케이스**가 단위이고, 조치(삭제·제재·종결)를 한 화면에서 끝낸다.
import { useActionState, useMemo, useState } from 'react';
import {
  resolveReportCase,
  assignReportCase,
  setReportPriority,
  saveReportNote,
  deleteReportedContent,
  type ReportActionState,
} from '@/app/lib/actions/admin-reports';
import SanctionDialog from '../access/sanctions/sanction-dialog';
import { reasonLabel, targetLabel, REPORT_TARGETS, REPORT_TARGET_LABELS } from '@/app/lib/report-targets';
import {
  PRIORITIES,
  PRIORITY_META,
  PriorityBadge,
  SlaBadge,
  StatusBadge,
  EmptyState,
  Callout,
  FIELD,
  FOCUS,
  BTN_NEUTRAL,
  BTN_DANGER,
  BTN_PRIMARY,
  type Priority,
} from '../ui';

export interface ReportAuthor {
  id: string;
  name: string;
  roleLabel: string;
  joinedAt: string;
  activeSanctions: number;
  pastSanctions: number;
  /** 이 작성자가 지금까지 받은 신고 수 (이 케이스 포함) */
  totalReports: number;
}

export interface ReportCase {
  dedupeKey: string;
  targetType: string;
  targetId: string;
  status: 'pending' | 'resolved' | 'dismissed';
  priority: string;
  count: number;
  firstAt: string;
  lastAt: string;
  assigneeId: string | null;
  assigneeName: string | null;
  internalNote: string | null;
  actionTaken: string | null;
  reasons: { reason: string; detail: string | null }[];
  /** 신고 대상 원문 스냅샷. 삭제됐으면 gone=true */
  content: { title: string | null; body: string; href: string | null; gone: boolean };
  author: ReportAuthor | null;
  /** 이 케이스에 속한 신고 ID — 제재 근거로 넘긴다 */
  reportIds: string[];
}

export interface Reviewer {
  id: string;
  name: string;
}

const initial: ReportActionState = {};

export default function ReportWorkspace({
  cases,
  reviewers,
  currentUserId,
  canModerate,
  canSanction,
}: {
  cases: ReportCase[];
  reviewers: Reviewer[];
  currentUserId: string;
  canModerate: boolean;
  canSanction: boolean;
}) {
  const [filter, setFilter] = useState<'pending' | 'mine' | 'done'>('pending');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(cases[0]?.dedupeKey ?? null);

  const visible = useMemo(() => {
    const list = cases.filter((c) => {
      if (filter === 'pending' && c.status !== 'pending') return false;
      if (filter === 'done' && c.status === 'pending') return false;
      if (filter === 'mine' && (c.status !== 'pending' || c.assigneeId !== currentUserId)) return false;
      if (reasonFilter !== 'all' && c.targetType !== reasonFilter) return false;
      return true;
    });
    // 우선순위 → 신고 수 → 오래된 순. 방치된 건이 위로 올라오게.
    return list.sort((a, b) => {
      const pw =
        PRIORITY_META[(b.priority as Priority) ?? 'normal'].weight -
        PRIORITY_META[(a.priority as Priority) ?? 'normal'].weight;
      if (pw !== 0) return pw;
      if (b.count !== a.count) return b.count - a.count;
      return new Date(a.firstAt).getTime() - new Date(b.firstAt).getTime();
    });
  }, [cases, filter, reasonFilter, currentUserId]);

  const selected = visible.find((c) => c.dedupeKey === selectedKey) ?? visible[0] ?? null;

  const counts = {
    pending: cases.filter((c) => c.status === 'pending').length,
    mine: cases.filter((c) => c.status === 'pending' && c.assigneeId === currentUserId).length,
    done: cases.filter((c) => c.status !== 'pending').length,
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {/* ---------- 좌: 케이스 큐 ---------- */}
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white lg:max-h-[calc(100vh-9rem)] lg:sticky lg:top-6">
        <div className="border-b border-hairline p-3">
          <div className="mb-2 flex gap-1">
            {(
              [
                ['pending', '미처리', counts.pending],
                ['mine', '내 담당', counts.mine],
                ['done', '처리됨', counts.done],
              ] as const
            ).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${FOCUS} ${
                  filter === key ? 'bg-signal text-white' : 'text-fg-secondary hover:bg-paper'
                }`}
              >
                {label} {n > 0 && <span className="font-mono">{n}</span>}
              </button>
            ))}
          </div>
          <select
            aria-label="대상 필터"
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className={`w-full rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs ${FOCUS}`}
          >
            <option value="all">모든 대상</option>
            {REPORT_TARGETS.map((tt) => (
              <option key={tt} value={tt}>
                {REPORT_TARGET_LABELS[tt]}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 divide-y divide-ink/5 overflow-y-auto">
          {visible.length === 0 && (
            <EmptyState title="해당하는 신고가 없습니다" sub="필터를 바꿔 보세요." />
          )}
          {visible.map((c) => {
            const on = selected?.dedupeKey === c.dedupeKey;
            return (
              <button
                key={c.dedupeKey}
                type="button"
                onClick={() => setSelectedKey(c.dedupeKey)}
                className={`block w-full px-4 py-3 text-left transition-colors ${
                  on ? 'bg-brand-50/70' : 'hover:bg-paper/60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <PriorityBadge priority={c.priority} />
                  <span className="font-mono text-[10px] text-fg-muted">
                    {targetLabel(c.targetType)}
                  </span>
                  {c.count > 1 && (
                    <span className="rounded-full bg-rose-600 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                      {c.count}명 신고
                    </span>
                  )}
                  <span className="ml-auto">
                    <SlaBadge since={c.firstAt} done={c.status !== 'pending'} />
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg">
                  {c.content.gone ? '(삭제된 콘텐츠)' : c.content.title || c.content.body.slice(0, 80)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {[...new Set(c.reasons.map((r) => r.reason))].map((r) => (
                    <span key={r} className="rounded border border-hairline bg-paper px-1 py-0.5 font-mono text-[9px] text-fg-muted">
                      {reasonLabel(r)}
                    </span>
                  ))}
                  {c.assigneeName && (
                    <span className="ml-auto font-mono text-[9px] text-brand-600">@{c.assigneeName}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ---------- 우: 케이스 상세 ---------- */}
      <div className="min-w-0">
        {selected ? (
          <CaseDetail
            key={selected.dedupeKey}
            item={selected}
            reviewers={reviewers}
            currentUserId={currentUserId}
            canModerate={canModerate}
            canSanction={canSanction}
          />
        ) : (
          <div className="rounded-[var(--radius-panel)] border border-hairline bg-white">
            <EmptyState title="처리할 신고가 없습니다" sub="새 신고가 들어오면 왼쪽 목록에 나타납니다." />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 케이스 상세 ---------- */

function CaseDetail({
  item,
  reviewers,
  currentUserId,
  canModerate,
  canSanction,
}: {
  item: ReportCase;
  reviewers: Reviewer[];
  currentUserId: string;
  canModerate: boolean;
  canSanction: boolean;
}) {
  const [state, formAction, pending] = useActionState(resolveReportCase, initial);
  const [actionTaken, setActionTaken] = useState('');
  const [sanctionOpen, setSanctionOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = item.status !== 'pending';

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          {done ? (
            <StatusBadge label={item.status === 'resolved' ? '처리완료' : '기각'} tone={item.status === 'resolved' ? 'done' : 'muted'} />
          ) : (
            <StatusBadge label="미처리" tone="open" />
          )}
          <PriorityBadge priority={item.priority} />
          <span className="text-sm font-semibold text-ink">
            {targetLabel(item.targetType)} 신고 {item.count}건
          </span>
          <span className="ml-auto font-mono text-[11px] text-fg-quiet">
            최초 {new Date(item.firstAt).toLocaleString('ko-KR')}
          </span>
        </div>

        {/* 트리아지 컨트롤 */}
        {!done && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-3">
            <form action={assignReportCase} className="flex items-center gap-1.5">
              <input type="hidden" name="dedupeKey" value={item.dedupeKey} />
              <label htmlFor={`assign-${item.dedupeKey}`} className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                담당
              </label>
              <select
                id={`assign-${item.dedupeKey}`}
                name="assigneeId"
                defaultValue={item.assigneeId ?? ''}
                className={`rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs ${FOCUS}`}
              >
                <option value="">미지정</option>
                {reviewers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.id === currentUserId ? ' (나)' : ''}
                  </option>
                ))}
              </select>
              <button className="rounded-lg border border-ink/15 px-2 py-1 text-[11px] text-fg-secondary hover:border-ink/40">
                지정
              </button>
            </form>

            <form action={setReportPriority} className="flex items-center gap-1.5">
              <input type="hidden" name="dedupeKey" value={item.dedupeKey} />
              <label htmlFor={`prio-${item.dedupeKey}`} className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                우선순위
              </label>
              <select
                id={`prio-${item.dedupeKey}`}
                name="priority"
                defaultValue={item.priority}
                className={`rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs ${FOCUS}`}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
              <button className="rounded-lg border border-ink/15 px-2 py-1 text-[11px] text-fg-secondary hover:border-ink/40">
                변경
              </button>
            </form>
          </div>
        )}
      </div>

      {/* 신고 대상 원문 */}
      <section className="rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">신고 대상 콘텐츠</h3>
        {item.content.gone ? (
          <p className="rounded-xl border border-hairline bg-paper/50 px-4 py-6 text-center text-xs text-fg-muted">
            삭제되었거나 찾을 수 없는 콘텐츠입니다. 이미 조치됐을 수 있습니다.
          </p>
        ) : (
          <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
            {item.content.title && <p className="mb-1 font-semibold text-ink">{item.content.title}</p>}
            <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-fg">
              {item.content.body}
            </p>
            {item.content.href && (
              <a
                href={item.content.href}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block font-mono text-[11px] text-brand-600 hover:underline"
              >
                원문 보기 ↗
              </a>
            )}
          </div>
        )}

        {/* 신고자별 사유 */}
        <h3 className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
          접수된 사유 ({item.reasons.length})
        </h3>
        <ul className="space-y-1.5">
          {item.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg bg-paper/50 px-3 py-2">
              <span className="shrink-0 rounded border border-rose-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-rose-700">
                {reasonLabel(r.reason)}
              </span>
              <span className="min-w-0 flex-1 text-xs leading-relaxed text-fg-secondary">
                {r.detail || <span className="text-fg-quiet">상세 사유 없음</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 작성자 맥락 — 초범인지 반복인지가 조치 수위를 정한다 */}
      {item.author && (
        <section className="rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">작성자</h3>
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-signal ring-1 ring-inset ring-brand-100"
            >
              {(item.author.name[0] ?? '?').toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-ink">
                {item.author.name}
                <span className="ml-1.5 font-mono text-[11px] text-fg-muted">{item.author.roleLabel}</span>
              </p>
              <p className="font-mono text-[11px] text-fg-muted">
                가입 {new Date(item.author.joinedAt).toLocaleDateString('ko-KR')} · 누적 신고{' '}
                {item.author.totalReports}건 · 제재 이력 {item.author.pastSanctions}건
              </p>
            </div>
            {item.author.activeSanctions > 0 && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-700">
                제재 중 {item.author.activeSanctions}건
              </span>
            )}
            {canSanction && !done && (
              <button type="button" onClick={() => setSanctionOpen(true)} className={`ml-auto ${BTN_DANGER}`}>
                이 작성자 제재
              </button>
            )}
          </div>

          {item.author.totalReports >= 3 && (
            <div className="mt-3">
              <Callout tone="warn" title="반복 신고 대상">
                이 계정은 지금까지 {item.author.totalReports}건의 신고를 받았습니다. 단건으로 보지 말고 이력을 함께
                고려하세요.
              </Callout>
            </div>
          )}
        </section>
      )}

      {/* 내부 메모 */}
      <section className="rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
        <form action={saveReportNote}>
          <input type="hidden" name="dedupeKey" value={item.dedupeKey} />
          <label htmlFor={`note-${item.dedupeKey}`} className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            내부 메모 (신고자·피신고자에게 보이지 않음)
          </label>
          <textarea
            id={`note-${item.dedupeKey}`}
            name="internalNote"
            rows={2}
            defaultValue={item.internalNote ?? ''}
            placeholder="판단 근거나 인수인계 사항을 남겨 두세요."
            className={FIELD}
          />
          <button className={`mt-2 ${BTN_NEUTRAL}`}>메모 저장</button>
        </form>
      </section>

      {/* 조치 */}
      {done ? (
        <section className="rounded-[var(--radius-panel)] border border-emerald-200 bg-emerald-50/40 p-5">
          <p className="text-sm font-semibold text-emerald-900">
            {item.status === 'resolved' ? '처리 완료' : '기각'}
          </p>
          {item.actionTaken && <p className="mt-1 text-xs text-emerald-800/80">조치 내용: {item.actionTaken}</p>}
        </section>
      ) : (
        <section className="rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
          <h3 className="mb-3 text-sm font-bold text-ink">조치</h3>

          {/* 콘텐츠 삭제 — 삭제와 신고 종결이 한 동작으로 묶여 있다 */}
          {canModerate && !item.content.gone && item.targetType !== 'user' && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50/40 p-3.5">
              {confirmDelete ? (
                <form action={deleteReportedContent} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="dedupeKey" value={item.dedupeKey} />
                  <p className="min-w-0 flex-1 text-xs text-rose-900">
                    이 {targetLabel(item.targetType)}을(를) 삭제하고 신고 {item.count}건을 함께 종결합니다. 삭제는
                    되돌릴 수 없습니다.
                  </p>
                  <button className={BTN_DANGER}>삭제 확정</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={BTN_NEUTRAL}>
                    취소
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-xs text-rose-900/80">
                    콘텐츠를 지우면 신고도 함께 처리완료로 종결됩니다.
                  </p>
                  <button type="button" onClick={() => setConfirmDelete(true)} className={BTN_DANGER}>
                    {targetLabel(item.targetType)} 삭제
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 종결 */}
          <form action={formAction}>
            <input type="hidden" name="dedupeKey" value={item.dedupeKey} />
            <label htmlFor={`taken-${item.dedupeKey}`} className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-fg-muted">
              처리 내용 (이력에 남습니다)
            </label>
            <input
              id={`taken-${item.dedupeKey}`}
              name="actionTaken"
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder="예: 광고성 게시물 삭제 + 작성자 7일 글쓰기 제한"
              className={FIELD}
            />


            {state.error && <p className="mt-2 text-xs text-rose-600">{state.error}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button name="action" value="resolve" disabled={pending} className={BTN_PRIMARY}>
                {pending ? '처리 중…' : `처리완료 (${item.count}건)`}
              </button>
              <button name="action" value="dismiss" disabled={pending} className={BTN_NEUTRAL}>
                기각
              </button>
              <p className="text-[11px] text-fg-muted">
                묶인 신고 {item.count}건이 함께 종결됩니다.
              </p>
            </div>
          </form>
        </section>
      )}

      {sanctionOpen && item.author && (
        <SanctionDialog
          target={{ id: item.author.id, name: item.author.name }}
          presetReportIds={item.reportIds}
          presetReason={`커뮤니티 가이드라인 위반 — ${[...new Set(item.reasons.map((r) => reasonLabel(r.reason)))].join(', ')}`}
          onClose={() => setSanctionOpen(false)}
        />
      )}
    </div>
  );
}
