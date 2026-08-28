'use client';

// 문제 에디터 — 관리자 전용. 설명(markdown)에는 커뮤니티와 동일한 툴바를 쓴다.
// initial이 있으면 수정 모드(updateProblem), 없으면 생성 모드(createProblem).
import { useActionState, useRef, useState } from 'react';
import { createProblem, updateProblem, type ProblemFormState } from '@/app/lib/actions/problems';
import { LANGUAGES, LANGUAGE_LABELS, type Language } from '@/app/lib/types';
import MarkdownToolbar from '@/app/community/write/markdown-toolbar';

export interface ProblemInitial {
  id: number;
  title: string;
  slug: string;
  difficulty: number;
  category: string;
  tags: string[];
  description: string;
  timeLimitMs: number;
  company: string;
  examYear: string;
  starterJs: string;
  starterPy: string;
  /** 이 문제가 이미 지원하는 언어 — 수정 모드에서 체크 상태의 초기값이 된다 */
  languages: Language[];
  keywords: string[];
  testCases: { input: string; expected: string; isHidden: boolean }[];
}

const initialState: ProblemFormState = {};

const LABEL = 'block font-mono text-xs text-fg-secondary tracking-wider mb-1.5';
const FIELD =
  'w-full rounded-lg border border-ink/15 bg-paper/50 px-4 py-2.5 text-sm placeholder:text-fg-quiet focus:outline-none focus:ring-2 focus:ring-signal/60';
const CODE_FIELD =
  'w-full rounded-lg border border-ink/15 bg-ink text-emerald-100 px-4 py-3 text-sm font-mono leading-relaxed placeholder:text-fg-on-dark-quiet focus:outline-none focus:ring-2 focus:ring-signal/60';

const CATEGORIES = ['해시', '스택', 'DP', '그리디', '그래프', '자료구조'];

/** 언어 → 스타터 입력의 name과 빈 화면에 깔아 줄 뼈대 */
const STARTER: Record<Language, { field: 'starterJs' | 'starterPy'; placeholder: string }> = {
  javascript: {
    field: 'starterJs',
    placeholder: 'function solution(nums, target) {\n  // 여기에 작성\n}',
  },
  python: {
    field: 'starterPy',
    placeholder: 'def solution(nums, target):\n    # 여기에 작성\n    pass',
  },
};

interface TcRow {
  key: number;
  hidden: boolean;
  input?: string;
  expected?: string;
}

export default function ProblemEditor({ initial }: { initial?: ProblemInitial }) {
  const [state, formAction, pending] = useActionState(initial ? updateProblem : createProblem, initialState);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [tcRows, setTcRows] = useState<TcRow[]>(
    initial && initial.testCases.length > 0
      ? initial.testCases.map((tc, i) => ({ key: i, hidden: tc.isHidden, input: tc.input, expected: tc.expected }))
      : [{ key: 0, hidden: false }],
  );
  const nextKey = useRef(initial ? initial.testCases.length : 1);
  // 새 문제는 두 언어를 모두 켠 채로 시작한다 — 대부분의 문제가 그렇고, 끄는 편이
  // 켜는 편보다 쉽다. 수정 모드에서는 실제로 스타터 코드가 있는 언어만 켠다.
  const [languages, setLanguages] = useState<Language[]>(
    initial ? initial.languages : [...LANGUAGES],
  );

  function toggleLanguage(l: Language) {
    setLanguages((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  }

  const err = (m?: string[]) => m?.length && <p className="mt-1.5 text-xs text-rose-600">{m[0]}</p>;

  return (
    <form action={formAction} className="space-y-6">
      {initial && <input type="hidden" name="problemId" value={initial.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="title" className={LABEL}>TITLE — 문제 제목</label>
          <input id="title" name="title" required defaultValue={initial?.title} placeholder="두 수의 합" className={FIELD} />
          {err(state.errors?.title)}
        </div>
        <div>
          <label htmlFor="slug" className={LABEL}>SLUG (선택 — 비우면 자동 생성)</label>
          <input id="slug" name="slug" defaultValue={initial?.slug} placeholder="two-sum" className={FIELD} />
          {err(state.errors?.slug)}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <label htmlFor="difficulty" className={LABEL}>DIFFICULTY</label>
          <select id="difficulty" name="difficulty" defaultValue={initial ? String(initial.difficulty) : '1'} className={FIELD}>
            <option value="1">1 — 입문</option>
            <option value="2">2 — 초급</option>
            <option value="3">3 — 중급</option>
            <option value="4">4 — 고급</option>
          </select>
        </div>
        <div>
          <label htmlFor="category" className={LABEL}>CATEGORY</label>
          <input id="category" name="category" required defaultValue={initial?.category} list="dc-categories" placeholder="해시" className={FIELD} />
          <datalist id="dc-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {err(state.errors?.category)}
        </div>
        <div>
          <label htmlFor="timeLimitMs" className={LABEL}>TIME LIMIT (ms)</label>
          <input id="timeLimitMs" name="timeLimitMs" type="number" defaultValue={initial?.timeLimitMs ?? 3000} min={500} max={30000} step={500} className={FIELD} />
        </div>
        <div>
          <label htmlFor="tags" className={LABEL}>TAGS (쉼표 구분)</label>
          <input id="tags" name="tags" defaultValue={initial?.tags.join(', ')} placeholder="배열, 해시맵" className={FIELD} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="company" className={LABEL}>COMPANY — 기출 기업 (선택)</label>
          <input id="company" name="company" defaultValue={initial?.company} placeholder="카카오" className={FIELD} />
        </div>
        <div>
          <label htmlFor="examYear" className={LABEL}>EXAM YEAR (선택)</label>
          <input id="examYear" name="examYear" defaultValue={initial?.examYear} placeholder="2025" className={FIELD} />
        </div>
      </div>

      <div>
        <label htmlFor="description" className={LABEL}>DESCRIPTION — 문제 설명 (마크다운)</label>
        <MarkdownToolbar textareaRef={descRef} />
        <textarea
          ref={descRef}
          id="description"
          name="description"
          rows={12}
          required
          defaultValue={initial?.description}
          placeholder={'문제 설명을 마크다운으로 작성하세요.\n\n### 입력\n- nums: 정수 배열\n\n### 출력\n- 두 수의 인덱스 배열'}
          className="w-full rounded-b-lg border border-ink/15 bg-paper/50 px-4 py-3 text-sm font-mono leading-relaxed placeholder:text-fg-quiet focus:outline-none focus:ring-2 focus:ring-signal/60"
        />
        {err(state.errors?.description)}
      </div>

      <div>
        <label htmlFor="keywords" className={LABEL}>KEYWORDS — 면접 평가 기대 키워드 (쉼표 구분, 필수)</label>
        <input id="keywords" name="keywords" required defaultValue={initial?.keywords.join(', ')} placeholder="시간복잡도, 해시맵, 공간 트레이드오프" className={FIELD} />
        <p className="mt-1.5 text-xs text-fg-quiet">DebateAI가 면접에서 이 키워드들을 짚었는지 평가합니다.</p>
      </div>

      {/* ---- 지원 언어 ---- */}
      <fieldset>
        <legend className={LABEL}>LANGUAGES — 이 문제로 풀 수 있는 언어 (1개 이상)</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => {
            const on = languages.includes(l);
            return (
              <label
                key={l}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
                  on
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-hairline bg-white text-fg-muted hover:border-brand-300 hover:text-signal'
                }`}
              >
                <input
                  type="checkbox"
                  name="languages"
                  value={l}
                  checked={on}
                  onChange={() => toggleLanguage(l)}
                  className="h-4 w-4 accent-[#1800AC]"
                />
                {LANGUAGE_LABELS[l]}
              </label>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-fg-quiet">
          고른 언어만 문제 화면의 언어 선택에 뜨고, 문제집 목록의 언어 필터에도 그대로 반영됩니다.
        </p>
        {err(state.errors?.languages)}
      </fieldset>

      {/* ---- 스타터 코드 — 고른 언어만 ---- */}
      {languages.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-hairline px-4 py-6 text-center text-sm text-fg-muted">
          위에서 언어를 하나 이상 고르면 그 언어의 시작 코드를 입력하는 칸이 나타납니다.
        </p>
      ) : (
        <div className={`grid gap-4 ${languages.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {LANGUAGES.filter((l) => languages.includes(l)).map((l) => {
            const { field, placeholder } = STARTER[l];
            return (
              <div key={l}>
                <label htmlFor={field} className={LABEL}>
                  STARTER — {LANGUAGE_LABELS[l]}
                </label>
                <textarea
                  id={field}
                  name={field}
                  rows={8}
                  required
                  defaultValue={initial?.[field]}
                  placeholder={placeholder}
                  className={CODE_FIELD}
                />
                {err(state.errors?.[field])}
              </div>
            );
          })}
        </div>
      )}

      {/* ---- 테스트케이스 ---- */}
      <div className="rounded-xl border border-hairline bg-paper/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className={`${LABEL} mb-0`}>테스트케이스 — 입력은 인자 배열(JSON), 기대값은 JSON</span>
          <button
            type="button"
            onClick={() => setTcRows((rows) => [...rows, { key: nextKey.current++, hidden: false }])}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            + 케이스 추가
          </button>
        </div>
        <div className="space-y-3">
          {tcRows.map((row, i) => (
            <div key={row.key} className="rounded-lg border border-hairline bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] text-fg-quiet">CASE {i + 1}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-fg-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.hidden}
                      onChange={() =>
                        setTcRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, hidden: !r.hidden } : r)))
                      }
                      className="accent-[#4531d9]"
                    />
                    히든 케이스
                  </label>
                  {tcRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTcRows((rows) => rows.filter((r) => r.key !== row.key))}
                      className="text-xs text-fg-quiet hover:text-rose-500"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
              <input type="hidden" name="tcHidden" value={row.hidden ? '1' : '0'} />
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="tcInput" defaultValue={row.input} placeholder='입력 예: [[2,7,11,15], 9]' className={`${FIELD} font-mono text-xs`} />
                <input name="tcExpected" defaultValue={row.expected} placeholder="기대값 예: [0,1]" className={`${FIELD} font-mono text-xs`} />
              </div>
            </div>
          ))}
        </div>
        {err(state.errors?.testCases)}
      </div>

      {state.errors?.form && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{state.errors.form[0]}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="px-6 py-3 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-50"
      >
        {pending ? '저장 중…' : initial ? '수정 저장하기' : '문제 등록하기'}
      </button>
    </form>
  );
}
