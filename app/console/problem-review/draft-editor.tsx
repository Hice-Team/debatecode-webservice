'use client';

// 초안 수정 — 승인 전에 검토자가 직접 다듬는다.
//
// 예전에는 승인/반려 두 가지뿐이었다. 테스트케이스 형식 하나가 틀려도 반려하고 출제자에게
// 다시 올려 달라고 해야 했고, 왕복이 길어져 큐가 밀렸다. 대부분은 검토자가 30초면 고칠
// 내용이다. payload를 그대로 열어 두는 이유는, 필드가 문제 유형에 따라 달라서
// 폼으로 고정하면 새 필드를 쓸 수 없기 때문이다.
import { useActionState, useState } from 'react';
import { editProblemDraft, type ProblemUploadState } from '@/app/lib/actions/admin-problems';
import { PROBLEM_CATEGORIES, DIFFICULTY_LABEL } from '@/app/lib/problem-import';
import { FIELD, Callout, BTN_PRIMARY, BTN_NEUTRAL } from '../ui';

const initial: ProblemUploadState = {};

export interface DraftEditable {
  id: string;
  title: string;
  difficulty: number;
  category: string;
  description: string;
  payload: string; // JSON 문자열
  caseCount: number;
}

export default function DraftEditor({ draft }: { draft: DraftEditable }) {
  const [state, formAction, pending] = useActionState(editProblemDraft, initial);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState(draft.payload);

  let payloadError: string | null = null;
  try {
    JSON.parse(payload || '{}');
  } catch (error) {
    payloadError = error instanceof Error ? error.message : 'JSON 오류';
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BTN_NEUTRAL}>
        수정 후 승인하기
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-xl border border-brand-200 bg-brand-50/30 p-4">
      <input type="hidden" name="id" value={draft.id} />

      {draft.caseCount === 0 && (
        <Callout tone="danger" title="테스트케이스가 없습니다">
          이대로 승인하면 채점이 되지 않는 문제가 게시됩니다. 아래 payload의{' '}
          <code className="rounded bg-surface/60 px-1">testCases</code>를 채운 뒤 승인하세요.
        </Callout>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem]">
        <div>
          <label htmlFor={`t-${draft.id}`} className="mb-1 block font-mono text-[10px] tracking-wider text-fg-muted">
            제목
          </label>
          <input id={`t-${draft.id}`} name="title" defaultValue={draft.title} required className={FIELD} />
        </div>
        <div>
          <label htmlFor={`d-${draft.id}`} className="mb-1 block font-mono text-[10px] tracking-wider text-fg-muted">
            난이도
          </label>
          <select id={`d-${draft.id}`} name="difficulty" defaultValue={draft.difficulty} className={FIELD}>
            {[1, 2, 3, 4].map((d) => (
              <option key={d} value={d}>
                {d} · {DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`c-${draft.id}`} className="mb-1 block font-mono text-[10px] tracking-wider text-fg-muted">
            카테고리
          </label>
          <select id={`c-${draft.id}`} name="category" defaultValue={draft.category} className={FIELD}>
            {PROBLEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {!PROBLEM_CATEGORIES.includes(draft.category as (typeof PROBLEM_CATEGORIES)[number]) && (
              <option value={draft.category}>{draft.category}</option>
            )}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={`desc-${draft.id}`} className="mb-1 block font-mono text-[10px] tracking-wider text-fg-muted">
          문제 지문 (마크다운)
        </label>
        <textarea
          id={`desc-${draft.id}`}
          name="description"
          rows={8}
          defaultValue={draft.description}
          required
          className={`${FIELD} font-mono text-[12px]`}
        />
      </div>

      <div>
        <label htmlFor={`p-${draft.id}`} className="mb-1 block font-mono text-[10px] tracking-wider text-fg-muted">
          payload — tags · timeLimitMs · starterCodes · keywords · testCases
        </label>
        <textarea
          id={`p-${draft.id}`}
          name="payload"
          rows={12}
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          className={`${FIELD} font-mono text-[12px]`}
        />
        {payloadError ? (
          <p className="mt-1 text-[11px] text-rose-600">JSON 오류: {payloadError}</p>
        ) : (
          <p className="mt-1 text-[11px] text-fg-muted">
            testCases의 input은 <strong>인자 배열</strong>입니다. 예:{' '}
            <code className="rounded bg-surface px-1">{'{"input": [[2,7,11,15], 9], "expected": [0,1]}'}</code>
          </p>
        )}
      </div>

      {state.errors && state.errors.length > 0 && (
        <ul className="list-inside list-disc space-y-0.5 text-[11px] text-rose-700">
          {state.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {state.saved && <p className="text-xs text-emerald-700">{state.saved}</p>}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending || Boolean(payloadError)} className={BTN_PRIMARY}>
          {pending ? '저장 중…' : '초안 저장'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={BTN_NEUTRAL}>
          닫기
        </button>
      </div>
    </form>
  );
}
