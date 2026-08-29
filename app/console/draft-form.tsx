'use client';

// 문제 초안 제출 폼 — 디베이트메이트/문제출제자가 검토큐로 문제를 제출한다.
import { useActionState, useState } from 'react';
import { submitProblemDraft, type DraftState } from '@/app/lib/actions/user-requests';

const initial: DraftState = {};
const FIELD =
  'w-full rounded-lg border border-hairline bg-paper/40 px-3 py-2 text-sm placeholder:text-fg-quiet focus:outline-none focus:ring-2 focus:ring-signal/50';
const CATEGORIES = ['해시', '스택', 'DP', '그리디', '그래프', '자료구조'];

export default function DraftForm() {
  const [state, formAction, pending] = useActionState(submitProblemDraft, initial);
  const [open, setOpen] = useState(false);
  const [donate, setDonate] = useState(false);

  if (state.saved) {
    return <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">초안이 검토큐에 제출되었습니다. 검토 결과를 기다려 주세요.</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        + 새 문제 초안 작성
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="draft-title" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">제목</label>
          <input id="draft-title" name="title" required minLength={2} placeholder="예: 두 수의 합" className={FIELD} />
        </div>
        <div>
          <label htmlFor="draft-difficulty" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">난이도</label>
          <select id="draft-difficulty" name="difficulty" className={FIELD}>
            <option value="1">1 · 입문</option>
            <option value="2">2 · 초급</option>
            <option value="3">3 · 중급</option>
            <option value="4">4 · 고급</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="draft-category" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">카테고리</label>
        <select id="draft-category" name="category" className={FIELD}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="draft-desc" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">문제 설명 (마크다운)</label>
        <textarea id="draft-desc" name="description" required rows={6} placeholder="문제 지문, 입출력 형식, 제약 조건, 예제를 마크다운으로 작성하세요" className={`${FIELD}`} />
      </div>
      {/* 저작권 기증 위임서 (선택) */}
      <div className="rounded-xl border border-hairline bg-paper/40 p-4">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg">
          <input
            type="checkbox"
            name="copyrightDonate"
            checked={donate}
            onChange={(e) => setDonate(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#1800AC]"
          />
          <span>
            <span className="font-semibold text-fg">저작권 기증 위임서 작성 (선택)</span>
            <span className="mt-0.5 block text-[11px] text-fg-muted">
              기본적으로 출제 문제의 저작권은 창작자에게 있습니다. 아래에 동의하면 이 문제에 한해 저작권을 debateCode에 기증·위임합니다.
            </span>
          </span>
        </label>
        {donate && (
          <div className="mt-3 space-y-2 border-t border-hairline pt-3">
            <p className="rounded-lg bg-surface border border-hairline px-3 py-2 text-[11px] leading-relaxed text-fg-secondary">
              본인은 위 문제의 창작자로서, 해당 저작물(문제 지문·테스트케이스·해설 포함)의 저작재산권을 debateCode 운영주체에
              무상 기증하며, debateCode가 이를 문제 은행 게시·복제·전송·2차적 저작물 작성에 이용하도록 위임합니다.
              저작인격권은 창작자에게 유지됩니다.
            </p>
            <label htmlFor="draft-signer" className="block font-mono text-xs text-fg-secondary tracking-wider">서명 (성명)</label>
            <input id="draft-signer" name="signerName" placeholder="본인 성명을 입력해 서명" className={FIELD} />
          </div>
        )}
      </div>

      {state.errors?.form && <p className="text-xs text-rose-600">{state.errors.form[0]}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50">
          {pending ? '제출 중…' : '검토큐에 제출'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-hairline px-4 py-2 text-sm text-fg-secondary hover:border-fg-quiet">취소</button>
      </div>
      <p className="text-[11px] text-fg-muted">테스트케이스·스타터코드는 검토 과정에서 검토자와 함께 보완합니다.</p>
    </form>
  );
}
