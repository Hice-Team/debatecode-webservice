'use client';

// 문제 업로드 — 단건 폼 + 테스트케이스 표 편집.
//
// 테스트케이스를 표로 편집하게 한 이유: JSON을 통째로 손으로 쓰면 인자 배열 형식
// (`[[2,7,11,15], 9]` = 인자 두 개)을 틀리기 쉽고, 틀려도 저장은 되기 때문에
// 문제를 열어 본 이용자가 처음 발견하게 된다.
import { useActionState, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createProblem, updateProblem, type ProblemUploadState } from '@/app/lib/actions/admin-problems';
import { PROBLEM_CATEGORIES, DIFFICULTY_LABEL } from '@/app/lib/problem-import';
import { FIELD, FOCUS, Callout, BTN_PRIMARY, BTN_NEUTRAL } from '../ui';

const initial: ProblemUploadState = {};

interface CaseRow {
  input: string;
  expected: string;
  isHidden: boolean;
}

const EMPTY_CASE: CaseRow = { input: '[]', expected: 'null', isHidden: false };

/** 수정 화면이 넘겨주는 기존 값. 없으면 새 문제 등록. */
export interface ProblemFormDefaults {
  id: number;
  title: string;
  difficulty: number;
  category: string;
  description: string;
  tags: string;
  keywords: string;
  timeLimitMs: number;
  company: string;
  examYear: string;
  starterJs: string;
  starterPy: string;
  cases: CaseRow[];
}

export default function UploadForm({ defaults }: { defaults?: ProblemFormDefaults }) {
  // 등록과 수정은 폼이 같고 액션만 다르다. 폼을 두 벌로 만들면 한쪽에만 필드가 추가되는 사고가 난다.
  const [state, formAction, pending] = useActionState(defaults ? updateProblem : createProblem, initial);
  const [description, setDescription] = useState(defaults?.description ?? '');
  const [showPreview, setShowPreview] = useState(false);
  const [cases, setCases] = useState<CaseRow[]>(
    defaults?.cases.length
      ? defaults.cases
      : [{ input: '[[2,7,11,15], 9]', expected: '[0,1]', isHidden: false }],
  );

  // 각 칸의 JSON 유효성을 즉석에서 표시한다 — 저장 후에 알면 늦다
  const caseErrors = cases.map((c) => {
    const errs: string[] = [];
    try {
      const parsed = JSON.parse(c.input);
      if (!Array.isArray(parsed)) errs.push('입력은 인자 배열이어야 합니다');
      else if (parsed.length === 0) errs.push('인자가 비어 있습니다');
    } catch {
      errs.push('입력 JSON 오류');
    }
    try {
      JSON.parse(c.expected);
    } catch {
      errs.push('기대값 JSON 오류');
    }
    return errs;
  });
  const hasCaseError = caseErrors.some((e) => e.length > 0);

  const serializedCases = JSON.stringify(
    cases.map((c, i) => {
      try {
        return { input: JSON.parse(c.input), expected: JSON.parse(c.expected), isHidden: c.isHidden, order: i };
      } catch {
        return { input: [], expected: null, isHidden: c.isHidden, order: i };
      }
    }),
  );

  if (state.saved) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-sm font-semibold text-emerald-900">{state.saved}</p>
        <button onClick={() => window.location.reload()} className={`mt-3 ${BTN_PRIMARY}`}>
          {defaults ? '새로고침' : '새 문제 계속 등록'}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="testCases" value={serializedCases} />
      {defaults && <input type="hidden" name="id" value={defaults.id} />}

      {/* 기본 정보 */}
      <section className="rounded-2xl border border-ink/10 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-ink">기본 정보</h3>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem_10rem]">
          <div>
            <label htmlFor="p-title" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
              제목
            </label>
            <input id="p-title" name="title" required minLength={2} defaultValue={defaults?.title} placeholder="예: 두 수의 합" className={FIELD} />
          </div>
          <div>
            <label htmlFor="p-diff" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
              난이도
            </label>
            <select id="p-diff" name="difficulty" defaultValue={String(defaults?.difficulty ?? 2)} className={FIELD}>
              {[1, 2, 3, 4].map((d) => (
                <option key={d} value={d}>
                  {d} · {DIFFICULTY_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="p-cat" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
              카테고리
            </label>
            <select id="p-cat" name="category" defaultValue={defaults?.category} className={FIELD}>
              {PROBLEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="p-company" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
              출제 기업 (선택)
            </label>
            <input id="p-company" name="company" defaultValue={defaults?.company} placeholder="예: 카카오" className={FIELD} />
          </div>
          <div>
            <label htmlFor="p-year" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
              기출 연도 (선택)
            </label>
            <input id="p-year" name="examYear" defaultValue={defaults?.examYear} placeholder="예: 2024" className={FIELD} />
          </div>
          <div>
            <label htmlFor="p-time" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
              제한 시간 (ms)
            </label>
            <input id="p-time" name="timeLimitMs" type="number" defaultValue={defaults?.timeLimitMs ?? 3000} min={500} max={20000} className={FIELD} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-tags" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
              태그 (쉼표 구분)
            </label>
            <input id="p-tags" name="tags" defaultValue={defaults?.tags} placeholder="배열, 해시맵" className={FIELD} />
          </div>
          <div>
            <label htmlFor="p-keywords" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
              면접 기대 키워드 (쉼표 구분)
            </label>
            <input id="p-keywords" name="keywords" defaultValue={defaults?.keywords} placeholder="해시맵, 시간복잡도" className={FIELD} />
            <p className="mt-1 text-[11px] text-ink-soft/50">AI 면접이 답변에서 확인할 개념입니다.</p>
          </div>
        </div>
      </section>

      {/* 지문 */}
      <section className="rounded-2xl border border-ink/10 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">문제 지문 (마크다운)</h3>
          <button type="button" onClick={() => setShowPreview((v) => !v)} className={BTN_NEUTRAL}>
            {showPreview ? '편집으로' : '미리보기'}
          </button>
        </div>
        {showPreview ? (
          <div className="prose prose-sm max-w-none rounded-xl border border-ink/10 bg-paper/40 px-4 py-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{description || '_(내용 없음)_'}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            name="description"
            rows={12}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={'## 문제\n...\n\n## 제약\n- ...\n\n## 예시\n입력: ...\n출력: ...'}
            className={`${FIELD} font-mono text-[13px]`}
          />
        )}
      </section>

      {/* 스타터 코드 */}
      <section className="rounded-2xl border border-ink/10 bg-white p-5">
        <h3 className="mb-1 text-sm font-bold text-ink">스타터 코드</h3>
        <p className="mb-3 text-xs text-ink-soft/55">
          이용자가 에디터를 열었을 때 처음 보이는 코드입니다. 함수명은 테스트케이스가 호출하는 이름과
          같아야 합니다.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor="p-js" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
              JavaScript
            </label>
            <textarea
              id="p-js"
              name="starterJs"
              rows={6}
              defaultValue={'function solution() {\n  \n}'}
              className={`${FIELD} font-mono text-[13px]`}
            />
          </div>
          <div>
            <label htmlFor="p-py" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
              Python
            </label>
            <textarea
              id="p-py"
              name="starterPy"
              rows={6}
              defaultValue={'def solution():\n    pass'}
              className={`${FIELD} font-mono text-[13px]`}
            />
          </div>
        </div>
      </section>

      {/* 테스트케이스 */}
      <section className="rounded-2xl border border-ink/10 bg-white p-5">
        <h3 className="mb-1 text-sm font-bold text-ink">테스트케이스</h3>
        <div className="mb-3">
          <Callout tone="info" title="입력은 인자 배열입니다">
            <code className="rounded bg-white/60 px-1">[[2,7,11,15], 9]</code>는 인자가 두 개(배열 하나 + 숫자
            하나)라는 뜻입니다. <code className="rounded bg-white/60 px-1">[2,7,11,15]</code>로 쓰면 인자 네 개가
            되어 채점이 전부 실패합니다.
          </Callout>
        </div>

        <div className="space-y-2">
          {cases.map((c, i) => (
            <div key={i} className="rounded-xl border border-ink/10 bg-paper/30 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft/40">#{i + 1}</span>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-soft/65">
                  <input
                    type="checkbox"
                    checked={c.isHidden}
                    onChange={(e) =>
                      setCases((prev) => prev.map((x, j) => (j === i ? { ...x, isHidden: e.target.checked } : x)))
                    }
                    className="h-3.5 w-3.5 accent-[#1800AC]"
                  />
                  히든 (이용자에게 내용 비공개)
                </label>
                {cases.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setCases((prev) => prev.filter((_, j) => j !== i))}
                    className={`ml-auto rounded-lg px-2 py-0.5 text-[11px] text-ink-soft/50 hover:text-rose-600 ${FOCUS}`}
                  >
                    삭제
                  </button>
                )}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-mono text-[10px] text-ink-soft/45">입력 (인자 배열 JSON)</label>
                  <input
                    value={c.input}
                    onChange={(e) => setCases((prev) => prev.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))}
                    className={`${FIELD} font-mono text-[12px]`}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] text-ink-soft/45">기대 반환값 (JSON)</label>
                  <input
                    value={c.expected}
                    onChange={(e) =>
                      setCases((prev) => prev.map((x, j) => (j === i ? { ...x, expected: e.target.value } : x)))
                    }
                    className={`${FIELD} font-mono text-[12px]`}
                  />
                </div>
              </div>
              {caseErrors[i].length > 0 && (
                <p className="mt-1.5 text-[11px] text-rose-600">{caseErrors[i].join(' · ')}</p>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setCases((prev) => [...prev, { ...EMPTY_CASE }])} className={`mt-3 ${BTN_NEUTRAL}`}>
          + 케이스 추가
        </button>
      </section>

      {state.errors && state.errors.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-rose-800">등록할 수 없습니다</p>
          <ul className="list-inside list-disc space-y-0.5 text-[11px] text-rose-700">
            {state.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending || hasCaseError} className={BTN_PRIMARY}>
          {pending ? '저장 중…' : defaults ? '수정 저장' : '문제 은행에 등록'}
        </button>
        {hasCaseError && <p className="text-xs text-rose-600">테스트케이스 JSON을 먼저 고쳐 주세요.</p>}
      </div>
    </form>
  );
}
