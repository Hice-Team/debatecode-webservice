'use client';

// 문의 처리 워크스페이스 — 신고 화면과 같은 2단 구조(좌: 큐 / 우: 상세).
//
// 예전 화면에서 실제로 곤란했던 것:
//   · 답변을 저장하면 폼이 사라져서 오타 하나도 고칠 수 없었다
//   · 답변해도 이용자는 알 방법이 없었다(메일 발송 없음)
//   · 담당자·분류가 없어 여러 명이 같은 문의를 중복 응대했다
//
// 이번에 더한 것:
//   · 답변자가 문의자의 지난 이력을 보고 답한다(같은 사람이 세 번째 묻는 중인지)
//   · 자주 쓰는 문단을 눌러서 넣는다 — 같은 문장을 매번 손으로 치지 않게
//   · J/K로 큐를 넘긴다(신고 화면과 같은 조작)
import { useActionState, useEffect, useMemo, useState } from 'react';
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
  /** 같은 사람을 묶을 식별자(계정·이메일)가 있는지 */
  identified: boolean;
  /** 이 건을 뺀, 같은 사람의 지난 문의 수 */
  priorCount: number;
  /** 이 건을 뺀, 같은 사람의 다른 미답변 문의 수 — 중복 응대 신호 */
  otherOpen: number;
  /** 회원이면 계정 정보, 비회원이면 null */
  member: { joinedDays: number; role: string; sanctioned: boolean } | null;
}

const MEMBER_ROLE: Record<string, string> = {
  user: '회원',
  debate_mate: '디베이트메이트',
  reviewer: '검토자',
  admin: '운영진',
  partner: '협력사',
};

export interface Responder {
  id: string;
  name: string;
}

/**
 * 자주 쓰는 답변 문단.
 *
 * 통째로 된 답장이 아니라 **문단 조각**이다. 눌러서 넣고 그 위에 사정에 맞게 고쳐
 * 쓴다. 완성된 템플릿을 넣으면 고치지 않고 그대로 보내게 되고, 받는 쪽은 사람이
 * 읽지 않았다는 것을 안다.
 */
const ANSWER_SNIPPETS: { label: string; text: string }[] = [
  { label: '접수 확인', text: '문의 주신 내용 확인했습니다.' },
  {
    label: '재현 요청',
    text: '확인을 위해 사용하신 브라우저와 문제가 난 화면 주소, 그리고 어떤 순서로 눌렀을 때 발생했는지 알려주세요.',
  },
  { label: '수정 예정', text: '확인된 문제입니다. 수정한 뒤 이 문의로 다시 알려드리겠습니다.' },
  {
    label: '본인 확인',
    text: '계정 관련 처리는 본인 확인이 필요합니다. 가입하신 이메일 주소로 회신해 주세요.',
  },
  {
    label: '제안 접수',
    text: '제안해 주신 내용은 검토 대상으로 기록해 두었습니다. 반영이 결정되면 공지로 알려드립니다.',
  },
  {
    label: '신고 안내',
    text: '신고는 해당 글의 신고 버튼으로 접수해 주세요. 처리 이력이 함께 남아 더 빠르게 확인됩니다.',
  },
  { label: '처리 완료', text: '요청하신 내용을 처리했습니다.' },
];

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
  const currentId = selected?.id ?? null;

  /**
   * J/K(또는 ↑/↓)로 큐를 넘긴다 — 신고 화면과 같은 조작.
   * 글을 치는 중에는 가로채지 않는다. 답변에 "k"를 적으려다 문의가 넘어가면
   * 쓰던 답변을 잃는다.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing =
        el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? '');
      if (typing) return;

      const step =
        e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown'
          ? 1
          : e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp'
            ? -1
            : 0;
      if (step === 0 || visible.length === 0) return;

      const at = visible.findIndex((q) => q.id === currentId);
      const next = visible[Math.min(visible.length - 1, Math.max(0, (at < 0 ? 0 : at) + step))];
      if (!next) return;

      e.preventDefault();
      setSelectedId(next.id);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, currentId]);

  // 미답변·답변됨·내 담당은 전부 받아 오므로 센 값이 실제 값이다.
  // 보관은 최근 100건만 받으므로 세면 조회 상한(100)을 지표처럼 보여 주게 된다 —
  // 숫자를 붙이지 않고, 목록 위에 무엇을 보고 있는지 적는다.
  const counts = {
    open: items.filter((q) => q.status === 'open').length,
    mine: items.filter((q) => q.status !== 'closed' && q.assigneeId === currentUserId).length,
    answered: items.filter((q) => q.status === 'answered').length,
    closed: null,
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
            ).map(([key, label, n]: readonly [typeof filter, string, number | null]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-[var(--radius-card)] px-2 py-1.5 text-xs font-semibold transition-colors ${FOCUS} ${
                  filter === key ? 'bg-signal text-white' : 'text-fg-secondary hover:bg-paper'
                }`}
              >
                {label} {n != null && n > 0 && <span className="font-mono">{n}</span>}
              </button>
            ))}
          </div>
          {/* 단축키가 있다는 것을 화면이 말해 주지 않으면 아무도 쓰지 않는다 */}
          <p className="mt-2 px-0.5 font-mono text-[10px] text-fg-quiet">
            <kbd className="rounded-[var(--radius-control)] border border-hairline px-1">J</kbd>{' '}
            <kbd className="rounded-[var(--radius-control)] border border-hairline px-1">K</kbd> 로 문의 이동
          </p>
        </div>

        <div className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
          {filter === 'closed' && (
            <p className="bg-paper px-4 py-2 font-mono text-[10px] text-fg-muted">
              최근 보관 100건까지 표시합니다
            </p>
          )}
          {visible.length === 0 && (
            <EmptyState
              title="해당하는 문의가 없습니다"
              sub={
                filter === 'open'
                  ? '미답변 문의가 없습니다. 새 문의가 들어오면 여기에 쌓입니다.'
                  : filter === 'mine'
                    ? '나에게 지정된 문의가 없습니다. 미답변 탭에서 담당자를 지정해 가져올 수 있습니다.'
                    : '이 상태에 해당하는 문의가 아직 없습니다.'
              }
            />
          )}
          {visible.map((q) => {
            const on = selected?.id === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelectedId(q.id)}
                // 키보드로 넘길 때 고른 줄이 목록 밖으로 나가면 어디인지 알 수 없다
                ref={on ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                aria-current={on ? 'true' : undefined}
                className={`block w-full border-l-2 px-4 py-3 text-left transition-colors ${FOCUS} ${
                  on ? 'border-signal bg-brand-50' : 'border-transparent hover:bg-paper'
                }`}
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
                <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[9px]">
                  {q.assigneeName && <span className="text-signal">@{q.assigneeName}</span>}
                  {/* 같은 사람의 다른 미답변이 열려 있으면 펼치기 전에 알아야 한다 */}
                  {q.otherOpen > 0 && (
                    <span className="text-amber-700">같은 문의자 미답변 {q.otherOpen}건</span>
                  )}
                </div>
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
              className={`rounded-[var(--radius-card)] border border-hairline bg-surface px-2 py-1 text-xs ${FOCUS}`}
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
              className={`rounded-[var(--radius-card)] border border-hairline bg-surface px-2 py-1 text-xs ${FOCUS}`}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
            <button className="rounded-[var(--radius-card)] border border-hairline px-2 py-1 text-[11px] text-fg-secondary hover:border-fg-quiet">
              분류 저장
            </button>
          </form>

          <form action={assignInquiry} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={item.id} />
            <select
              name="assigneeId"
              aria-label="담당자"
              defaultValue={item.assigneeId ?? ''}
              className={`rounded-[var(--radius-card)] border border-hairline bg-surface px-2 py-1 text-xs ${FOCUS}`}
            >
              <option value="">담당 미지정</option>
              {responders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.id === currentUserId ? ' (나)' : ''}
                </option>
              ))}
            </select>
            <button className="rounded-[var(--radius-card)] border border-hairline px-2 py-1 text-[11px] text-fg-secondary hover:border-fg-quiet">
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

      {/* 문의자 맥락 — 본문을 읽기 전에 본다.
          같은 사람이 세 번째 묻는 중인지, 다른 담당자가 이미 붙은 문의가 열려
          있는지 모르면 같은 답을 두 번 쓰거나 서로 다른 답을 보내게 된다. */}
      <section className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-5">
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">문의자</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {[
            {
              label: '구분',
              value: item.member ? MEMBER_ROLE[item.member.role] ?? item.member.role : '비회원',
              warn: false,
            },
            {
              label: '가입',
              value: item.member ? `${item.member.joinedDays}일 전` : '—',
              warn: false,
            },
            {
              label: '지난 문의',
              value: !item.identified
                ? '확인 불가'
                : item.priorCount === 0
                  ? '첫 문의'
                  : `${item.priorCount}건`,
              warn: item.priorCount >= 3,
            },
          ].map((f) => (
            <div key={f.label}>
              <dt className="font-mono text-[10px] text-fg-quiet">{f.label}</dt>
              <dd className={`text-sm font-semibold ${f.warn ? 'text-amber-700' : 'text-fg'}`}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* 판단을 대신하지 않는다 — 눈에 걸리는 사실만 짚어 준다 */}
        {(item.otherOpen > 0 || item.priorCount >= 3 || item.member?.sanctioned) && (
          <p className="mt-3 border-t border-hairline pt-2.5 text-[12px] leading-relaxed text-amber-800">
            {[
              item.otherOpen > 0 &&
                `같은 문의자의 미답변 문의가 ${item.otherOpen}건 더 있습니다. 함께 확인하세요.`,
              item.priorCount >= 3 && '전에도 여러 번 문의한 이용자입니다.',
              item.member?.sanctioned && '현재 제재 중인 계정입니다.',
            ]
              .filter(Boolean)
              .join(' ')}
          </p>
        )}
      </section>

      {/* 문의 본문 */}
      <section className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-5">
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">문의 내용</h3>
        <p className="whitespace-pre-wrap rounded-[var(--radius-panel)] bg-paper/50 px-4 py-3 text-sm leading-relaxed text-fg">
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
            <p className="whitespace-pre-wrap rounded-[var(--radius-panel)] border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm leading-relaxed text-fg">
              {item.answer}
            </p>
            {item.answeredByName && (
              <p className="mt-1.5 font-mono text-[11px] text-fg-quiet">답변자 {item.answeredByName}</p>
            )}
          </>
        ) : (
          <form action={formAction}>
            <input type="hidden" name="id" value={item.id} />
            {/* 눌러서 문단을 넣는다. 덮어쓰지 않고 뒤에 붙이므로 쓰던 글을 잃지 않는다. */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {ANSWER_SNIPPETS.map((snip) => (
                <button
                  key={snip.label}
                  type="button"
                  onClick={() =>
                    setAnswer((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${snip.text}` : snip.text))
                  }
                  title={snip.text}
                  className={`rounded-full border border-hairline px-2.5 py-1 text-[11px] font-medium text-fg-secondary transition-colors hover:border-signal/40 hover:text-signal ${FOCUS}`}
                >
                  {snip.label}
                </button>
              ))}
            </div>

            <textarea
              name="answer"
              rows={7}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              required
              placeholder="답변을 작성하세요. 위 문단을 눌러 넣고 고쳐 쓸 수 있습니다."
              className={FIELD}
            />


            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-fg-secondary">
              <input
                type="checkbox"
                name="notify"
                defaultChecked={item.canEmail}
                disabled={!item.canEmail}
                className="mt-0.5 h-4 w-4 accent-signal disabled:opacity-40"
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
