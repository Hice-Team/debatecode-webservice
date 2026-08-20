'use client';

// JSON 일괄 등록 — 검증 → 미리보기 → 저장.
//
// 바로 저장하지 않고 미리보기를 한 단계 두었다. 20건짜리 JSON에서 3번째 문제의
// 테스트케이스 형식이 틀렸을 때, 저장부터 하면 무엇이 들어가고 무엇이 안 들어갔는지
// 다시 세어야 한다. 어차피 검증은 해야 하니, 결과를 먼저 보여 주고 확인을 받는다.
import { useActionState, useState } from 'react';
import { bulkImportProblems, type ProblemUploadState } from '@/app/lib/actions/admin-problems';
import { IMPORT_EXAMPLE, DIFFICULTY_LABEL } from '@/app/lib/problem-import';
import { FIELD, Callout, BTN_PRIMARY, BTN_NEUTRAL } from '../ui';

const initial: ProblemUploadState = {};

export default function BulkImport() {
  const [state, formAction, pending] = useActionState(bulkImportProblems, initial);
  const [json, setJson] = useState('');

  const validated = Boolean(state.preview && state.preview.length > 0 && !state.saved);

  return (
    <div className="space-y-4">
      <Callout tone="info" title="형식">
        문제 객체의 배열, 또는 <code className="rounded bg-white/60 px-1">{'{ "problems": [...] }'}</code> 형태를
        받습니다. 한 번에 최대 50건. 각 문제에는 테스트케이스가 최소 1개 있어야 합니다.
      </Callout>

      <form action={formAction} className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="bulk-json" className="font-mono text-xs tracking-wider text-fg-secondary">
              문제 JSON
            </label>
            <button type="button" onClick={() => setJson(IMPORT_EXAMPLE)} className="font-mono text-[11px] text-brand-600 hover:underline">
              예시 채우기
            </button>
          </div>
          <textarea
            id="bulk-json"
            name="json"
            rows={16}
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder="여기에 JSON을 붙여 넣으세요."
            className={`${FIELD} font-mono text-[12px]`}
          />
        </div>

        {state.errors && state.errors.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="mb-1 text-xs font-semibold text-rose-800">{state.errors.length}개 문제가 있습니다</p>
            <ul className="list-inside list-disc space-y-0.5 text-[11px] text-rose-700">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {state.saved && (
          <Callout tone="ok" title="등록 완료">
            {state.saved}
          </Callout>
        )}

        {/* 검증 결과 */}
        {state.preview && state.preview.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-hairline">
            <p className="border-b border-hairline bg-paper/50 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
              검증 통과 {state.preview.length}건
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                  <th scope="col" className="px-4 py-2 text-left font-medium">제목</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">카테고리</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">난이도</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">케이스</th>
                </tr>
              </thead>
              <tbody>
                {state.preview.map((p, i) => (
                  <tr key={i} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">{p.title}</td>
                    <td className="px-4 py-2 text-fg-secondary">{p.category}</td>
                    <td className="px-4 py-2 text-fg-secondary">
                      {p.difficulty} · {DIFFICULTY_LABEL[p.difficulty]}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-fg-secondary">{p.cases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" name="mode" value="preview" disabled={pending || !json.trim()} className={BTN_NEUTRAL}>
            {pending ? '검증 중…' : '검증 · 미리보기'}
          </button>
          {validated && (
            <button type="submit" name="mode" value="commit" disabled={pending} className={BTN_PRIMARY}>
              {state.preview!.length}건 등록하기
            </button>
          )}
          {!validated && !state.saved && (
            <p className="text-[11px] text-fg-muted">먼저 검증해야 등록 버튼이 나타납니다.</p>
          )}
        </div>
      </form>
    </div>
  );
}
