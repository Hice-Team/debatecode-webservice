'use client';

// 문의 처리 워크스페이스 — 신고 화면과 같은 2단 구조(좌: 큐 / 우: 상세).
//
// 예전 화면에서 실제로 곤란했던 것:
//   · 답변을 저장하면 폼이 사라져서 오타 하나도 고칠 수 없었다
//   · 답변해도 이용자는 알 방법이 없었다(메일 발송 없음)
//   · 담당자·분류가 없어 여러 명이 같은 문의를 중복 응대했다
import { useActionState, useMemo, useState } from 'react';
import {
  answerInquiry,
  assignInquiry,
  classifyInquiry,
  closeInquiry,
  reopenInquiry,
  type InquiryActionState,
} from '@/app/lib/actions/admin-inquiries';
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
  BTN_PRIMARY,
  type Priority,
} from '../ui';

export const CATEGORY_LABEL: Record<string, string> = {
  account: '계정',
  bug: '버그',
  suggestion: '제안',
  report: '신고',
  payment: '결제·포인트',
  etc: '기타',
};

export interface InquiryItem {
  id: string;
  subject: string;
  body: string;
  /** 마스킹된 이메일. 비회원이면 '비회원' */
  contact: string;
  /** 회신 가능한 주소가 있는지 */
  canEmail: boolean;
  status: 'open' | 'answered' | 'closed';
  category: string | null;
  priority: string;
  assigneeId: string | null;
  assigneeName: string | null;
  answer: string | null;
  answeredByName: string | null;
  createdAt: string;
  firstResponseAt: string | null;
}

export interface Responder {
  id: string;
  name: string;
}

const initial: InquiryActionState = {};

export default function InquiryWorkspace({
  items,
  responders,
  currentUserId,
}: {
  items: InquiryItem[];
  responders: Responder[];
  currentUserId: string;
}) {
  const [filter, setFilter] = useState<'open' | 'mine' | 'answered' | 'closed'>('open');
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);

  const visible = useMemo(() => {
    const list = items.filter((q) => {
      if (filter === 'open') return q.status === 'open';
      if (filter === 'mine') return q.status !== 'closed' && q.assigneeId === currentUserId;
      if (filter === 'answered') return q.status === 'answered';
      return q.status === 'closed';
    });
    return list.sort((a, b) => {
      const pw =
        PRIORITY_META[(b.priority as Priority) ?? 'normal'].weight -
        PRIORITY_META[(a.priority as Priority) ?? 'normal'].weight;
      if (pw !== 0) return pw;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [items, filter, currentUserId]);

  const selected = visible.find((q) => q.id === selectedId) ?? visible[0] ?? null;

  const counts = {
    open: items.filter((q) => q.status === 'open').length,
    mine: items.filter((q) => q.status !== 'closed' && q.assigneeId === currentUserId).length,
    answered: items.filter((q) => q.status === 'answered').length,
    closed: items.filter((q) => q.status === 'closed').length,
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {/* ---------- 좌: 큐 ---------- */}
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)]">
        <div className="border-b border-hairline p-3">
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                ['open', '미답변', counts.open],
                ['mine', '내 담당', counts.mine],
                ['answered', '답변됨', counts.answered],
                ['closed', '보관', counts.closed],
              ] as const
            ).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${FOCUS} ${
                  filter === key ? 'bg-signal text-white' : 'text-fg-secondary hover:bg-paper'
                }`}
              >
                {label} {n > 0 && <span className="font-mono">{n}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
          {visible.length === 0 && <EmptyState title="해당하는 문의가 없습니다" />}
          {visible.map((q) => {
            const on = selected?.id === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelectedId(q.id)}
                className={`block w-full px-4 py-3 text-left transition-colors ${on ? 'bg-brand-50/70' : 'hover:bg-paper/60'}`}
              >
                <div className="flex items-center gap-1.5">
                  <PriorityBadge priority={q.priority} />
                  {q.category && (
                    <span className="rounded border border-hairline bg-paper px-1 py-0.5 font-mono text-[9px] text-fg-muted">
                      {CATEGORY_LABEL[q.category] ?? q.category}
                    </span>
                  )}
                  <span className="ml-auto">
                    <SlaBadge since={q.createdAt} done={q.status !== 'open'} />
                  </span>
                </div>
                <p className="mt-1 truncate text-xs font-medium text-fg">{q.subject}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">{q.body}</p>
                {q.assigneeName && <p className="mt-1 font-mono text-[9px] text-brand-600">@{q.assigneeName}</p>}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ---------- 우: 상세 ---------- */}
      <div className="min-w-0">
        {selected ? (
          <InquiryDetail
            key={selected.id}
            item={selected}
            responders={responders}
            currentUserId={currentUserId}
          />
        ) : (
          <div className="rounded-[var(--radius-panel)] border border-hairline bg-surface">
            <EmptyState title="문의가 없습니다" sub="새 문의가 들어오면 왼쪽 목록에 나타납니다." />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 상세 ---------- */

function InquiryDetail({
  item,
  responders,
  currentUserId,
}: {
  item: InquiryItem;
  responders: Responder[];
  currentUserId: string;
}) {
  const [state, formAction, pending] = useActionState(answerInquiry, initial);
  const [answer, setAnswer] = useState(item.answer ?? '');
  const [editing, setEditing] = useState(!item.answer);


  return (
    <div className="space-y-4">
      {/* 헤더 + 트리아지 */}
      <div className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={item.status === 'open' ? '미답변' : item.status === 'answered' ? '답변됨' : '보관'}
            tone={item.status === 'open' ? 'open' : item.status === 'answered' ? 'done' : 'muted'}
          />
          <PriorityBadge priority={item.priority} />
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-fg">{item.subject}</h2>
        </div>
        <p className="mt-1 font-mono text-[11px] text-fg-muted">
          {item.contact} · 접수 {new Date(item.createdAt).toLocaleString('ko-KR')}
          {item.firstResponseAt && ` · 첫 응답 ${new Date(item.firstResponseAt).toLocaleString('ko-KR')}`}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <form action={classifyInquiry} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={item.id} />
            <select
              name="category"
              aria-label="분류"
              defaultValue={item.category ?? 'etc'}
              className={`rounded-lg border border-hairline bg-surface px-2 py-1 text-xs ${FOCUS}`}
            >
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              name="priority"
              aria-label="우선순위"
              defaultValue={item.priority}
              className={`rounded-lg border border-hairline bg-surface px-2 py-1 text-xs ${FOCUS}`}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-hairline px-2 py-1 text-[11px] text-fg-secondary hover:border-fg-quiet">
              분류 저장
            </button>
          </form>

          <form action={assignInquiry} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={item.id} />
            <select
              name="assigneeId"
              aria-label="담당자"
              defaultValue={item.assigneeId ?? ''}
              className={`rounded-lg border border-hairline bg-surface px-2 py-1 text-xs ${FOCUS}`}
            >
              <option value="">담당 미지정</option>
              {responders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.id === currentUserId ? ' (나)' : ''}
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-hairline px-2 py-1 text-[11px] text-fg-secondary hover:border-fg-quiet">
              지정
            </button>
          </form>

          <div className="ml-auto flex items-center gap-2">
            {item.status === 'closed' ? (
              <form action={reopenInquiry}>
                <input type="hidden" name="id" value={item.id} />
                <button className={BTN_NEUTRAL}>재개</button>
              </form>
            ) : (
              item.answer && (
                <form action={closeInquiry}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className={BTN_NEUTRAL}>보관</button>
                </form>
              )
            )}
          </div>
        </div>
      </div>

      {/* 문의 본문 */}
      <section className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-5">
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">문의 내용</h3>
        <p className="whitespace-pre-wrap rounded-xl bg-paper/50 px-4 py-3 text-sm leading-relaxed text-fg">
          {item.body}
        </p>
      </section>

      {/* 답변 */}
      <section className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">답변</h3>
          {item.answer && !editing && (
            <button type="button" onClick={() => setEditing(true)} className={BTN_NEUTRAL}>
              답변 수정
            </button>
          )}
        </div>

        {!editing && item.answer ? (
          <>
            <p className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm leading-relaxed text-fg">
              {item.answer}
            </p>
            {item.answeredByName && (
              <p className="mt-1.5 font-mono text-[11px] text-fg-quiet">답변자 {item.answeredByName}</p>
            )}
          </>
        ) : (
          <form action={formAction}>
            <input type="hidden" name="id" value={item.id} />
            <textarea
              name="answer"
              rows={7}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              required
              placeholder="답변을 작성하세요."
              className={FIELD}
            />


            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-fg-secondary">
              <input
                type="checkbox"
                name="notify"
                defaultChecked={item.canEmail}
                disabled={!item.canEmail}
                className="mt-0.5 h-4 w-4 accent-[#1800AC] disabled:opacity-40"
              />
              <span>
                답변 저장 시 회신 메일 보내기
                {!item.canEmail && (
                  <span className="ml-1 text-fg-quiet">— 회신 가능한 주소가 없어 보낼 수 없습니다</span>
                )}
              </span>
            </label>

            {state.error && <p className="mt-2 text-xs text-rose-600">{state.error}</p>}
            {state.saved && (
              <div className="mt-2">
                <Callout tone={state.mailed === 'sent' ? 'ok' : 'info'}>
                  {state.saved}
                  {state.mailed === 'sent' && ' 회신 메일을 보냈습니다.'}
                  {state.mailed === 'dry-run' &&
                    ' 메일 키가 없어 실제로 발송되지는 않았습니다(dry-run). 이용자는 답변을 받지 못합니다.'}
                  {state.mailed === 'skipped' && ' 회신 메일은 보내지 않았습니다.'}
                </Callout>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button type="submit" disabled={pending} className={BTN_PRIMARY}>
                {pending ? '저장 중…' : item.answer ? '답변 수정 저장' : '답변 저장'}
              </button>
              {item.answer && (
                <button
                  type="button"
                  onClick={() => {
                    setAnswer(item.answer ?? '');
                    setEditing(false);
                  }}
                  className={BTN_NEUTRAL}
                >
                  취소
                </button>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
