'use client';

// 문제 업로드 — 네 단계로 나눈 단건 폼 + 테스트케이스 표 편집.
//
// 문제 하나를 등록하려면 기본 정보·지문·스타터 코드·테스트케이스 넷이 다 있어야 한다.
// 예전에는 이 넷이 같은 무게의 카드로 쌓여 있어서, 어디까지 채웠고 무엇이 비었는지
// 제출 버튼을 눌러 봐야 알 수 있었다. 지금은 단계마다 번호와 현재 상태를 적는다 —
// "지문 512자", "케이스 3개 · 숨김 1" 처럼 채워진 정도가 접힌 채로도 보인다.
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
import { LANGUAGES, LANGUAGE_LABELS, type Language } from '@/app/lib/types';

/** 언어 → 스타터 입력의 id·name과 빈 값일 때 깔아 줄 뼈대 */
const STARTER_META: Record<Language, { id: string; field: 'starterJs' | 'starterPy'; skeleton: string }> = {
  javascript: { id: 'p-js', field: 'starterJs', skeleton: 'function solution() {\n  \n}' },
  python: { id: 'p-py', field: 'starterPy', skeleton: 'def solution():\n    pass' },
};

const initial: ProblemUploadState = {};

/**
 * 단계 하나. 번호 · 제목 · 지금 상태.
 *
 * `status`는 "얼마나 채워졌는가"를 짧게 적는다. 비어 있으면 무엇이 없는지 말하고
 * (`tone='empty'`), 그 자체가 다음에 할 일이 된다 — 제출을 눌러 봐야 알게 하지 않는다.
 */
function Step({
  n,
  title,
  desc,
  status,
  tone = 'ok',
  action,
  children,
}: {
  n: number;
  title: string;
  desc?: string;
  status: string;
  tone?: 'ok' | 'empty' | 'error';
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const badge =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : tone === 'empty'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-hairline bg-paper text-fg-muted';

  return (
    <section className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-2">
        <span
          aria-hidden
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-[11px] font-bold text-white"
        >
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-fg">{title}</h3>
          {desc && <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{desc}</p>}
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${badge}`}>{status}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

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
  /** 이미 스타터 코드가 있는 언어 — 체크 상태의 초기값 */
  languages: Language[];
  cases: CaseRow[];
}

export default function UploadForm({ defaults }: { defaults?: ProblemFormDefaults }) {
  // 등록과 수정은 폼이 같고 액션만 다르다. 폼을 두 벌로 만들면 한쪽에만 필드가 추가되는 사고가 난다.
  const [state, formAction, pending] = useActionState(defaults ? updateProblem : createProblem, initial);
  const [description, setDescription] = useState(defaults?.description ?? '');
  const [showPreview, setShowPreview] = useState(false);
  // 새 문제는 두 언어를 켠 채 시작한다 — 끄는 편이 켜는 편보다 쉽다.
  const [languages, setLanguages] = useState<Language[]>(defaults ? defaults.languages : [...LANGUAGES]);
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

  // 아직 비어 있는 것 — 제출 바에서 이름으로 말해 준다.
  // "등록할 수 없습니다"만 띄우고 무엇이 문제인지는 서버 응답을 봐야 알던 자리다.
  const missing = [
    !description.trim() && '지문',
    languages.length === 0 && '지원 언어',
    cases.length === 0 && '테스트케이스',
  ].filter(Boolean) as string[];

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
      <div className="rounded-[var(--radius-panel)] border border-emerald-200 bg-emerald-50 p-5">
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

      <Step
        n={1}
        title="기본 정보"
        desc="목록과 검색에 쓰이는 값입니다."
        status={defaults ? '수정 중' : '필수'}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem_10rem]">
          <div>
            <label htmlFor="p-title" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              제목
            </label>
            <input id="p-title" name="title" required minLength={2} defaultValue={defaults?.title} placeholder="예: 두 수의 합" className={FIELD} />
          </div>
          <div>
            <label htmlFor="p-diff" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
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
            <label htmlFor="p-cat" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
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
            <label htmlFor="p-company" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              출제 기업 (선택)
            </label>
            <input id="p-company" name="company" defaultValue={defaults?.company} placeholder="예: 카카오" className={FIELD} />
          </div>
          <div>
            <label htmlFor="p-year" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              기출 연도 (선택)
            </label>
            <input id="p-year" name="examYear" defaultValue={defaults?.examYear} placeholder="예: 2024" className={FIELD} />
          </div>
          <div>
            <label htmlFor="p-time" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              제한 시간 (ms)
            </label>
            <input id="p-time" name="timeLimitMs" type="number" defaultValue={defaults?.timeLimitMs ?? 3000} min={500} max={20000} className={FIELD} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-tags" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              태그 (쉼표 구분)
            </label>
            <input id="p-tags" name="tags" defaultValue={defaults?.tags} placeholder="배열, 해시맵" className={FIELD} />
          </div>
          <div>
            <label htmlFor="p-keywords" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              면접 기대 키워드 (쉼표 구분)
            </label>
            <input id="p-keywords" name="keywords" defaultValue={defaults?.keywords} placeholder="해시맵, 시간복잡도" className={FIELD} />
            <p className="mt-1 text-[11px] text-fg-muted">AI 면접이 답변에서 확인할 개념입니다.</p>
          </div>
        </div>
      </Step>

      <Step
        n={2}
        title="문제 지문"
        desc="마크다운으로 씁니다. 제약과 예시를 함께 적어 주세요."
        status={description.trim() ? `${description.trim().length.toLocaleString()}자` : '비어 있음'}
        tone={description.trim() ? 'ok' : 'empty'}
        action={
          <button type="button" onClick={() => setShowPreview((v) => !v)} className={BTN_NEUTRAL}>
            {showPreview ? '편집으로' : '미리보기'}
          </button>
        }
      >
        {showPreview ? (
          <div className="prose prose-sm max-w-none rounded-[var(--radius-panel)] border border-hairline bg-paper/40 px-4 py-3">
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
      </Step>

      <Step
        n={3}
        title="지원 언어와 스타터 코드"
        desc="이용자가 에디터를 열었을 때 처음 보이는 코드입니다. 함수명은 테스트케이스가 호출하는 이름과 같아야 합니다."
        status={
          languages.length === 0
            ? '언어 없음'
            : languages.map((l) => LANGUAGE_LABELS[l]).join(' · ')
        }
        tone={languages.length === 0 ? 'empty' : 'ok'}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs tracking-wider text-fg-secondary">지원 언어</span>
          {LANGUAGES.map((l) => {
            const on = languages.includes(l);
            return (
              <label
                key={l}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
                  on
                    ? 'border-signal bg-signal/[0.08] text-signal'
                    : 'border-hairline bg-surface text-fg-muted hover:border-signal/40 hover:text-signal'
                }`}
              >
                <input
                  type="checkbox"
                  name="languages"
                  value={l}
                  checked={on}
                  onChange={() =>
                    setLanguages((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]))
                  }
                  className="h-4 w-4 accent-[#1800AC]"
                />
                {LANGUAGE_LABELS[l]}
              </label>
            );
          })}
        </div>
        {languages.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-hairline px-4 py-6 text-center text-sm text-fg-muted">
            언어를 하나 이상 골라 주세요. 고른 언어의 시작 코드만 입력하면 됩니다.
          </p>
        ) : (
          <div className={`grid gap-4 ${languages.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {LANGUAGES.filter((l) => languages.includes(l)).map((l) => (
              <div key={l}>
                <label
                  htmlFor={STARTER_META[l].id}
                  className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary"
                >
                  {LANGUAGE_LABELS[l]}
                </label>
                <textarea
                  id={STARTER_META[l].id}
                  name={STARTER_META[l].field}
                  rows={6}
                  defaultValue={
                    (defaults ? defaults[STARTER_META[l].field] : '') || STARTER_META[l].skeleton
                  }
                  className={`${FIELD} font-mono text-[13px]`}
                />
              </div>
            ))}
          </div>
        )}
      </Step>

      <Step
        n={4}
        title="테스트케이스"
        desc="채점이 실제로 돌려 보는 입력과 기대값입니다."
        status={
          hasCaseError
            ? 'JSON 오류'
            : `${cases.length}개${cases.filter((c) => c.isHidden).length > 0 ? ` · 숨김 ${cases.filter((c) => c.isHidden).length}` : ''}`
        }
        tone={hasCaseError ? 'error' : cases.length === 0 ? 'empty' : 'ok'}
      >
        <div className="mb-3">
          <Callout tone="info" title="입력은 인자 배열입니다">
            <code className="rounded bg-surface/60 px-1">[[2,7,11,15], 9]</code>는 인자가 두 개(배열 하나 + 숫자
            하나)라는 뜻입니다. <code className="rounded bg-surface/60 px-1">[2,7,11,15]</code>로 쓰면 인자 네 개가
            되어 채점이 전부 실패합니다.
          </Callout>
        </div>

        <div className="space-y-2">
          {cases.map((c, i) => (
            <div key={i} className="rounded-[var(--radius-panel)] border border-hairline bg-paper/30 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">#{i + 1}</span>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-secondary">
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
                    className={`ml-auto rounded-[var(--radius-card)] px-2 py-0.5 text-[11px] text-fg-muted hover:text-rose-600 ${FOCUS}`}
                  >
                    삭제
                  </button>
                )}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-mono text-[10px] text-fg-muted">입력 (인자 배열 JSON)</label>
                  <input
                    value={c.input}
                    onChange={(e) => setCases((prev) => prev.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))}
                    className={`${FIELD} font-mono text-[12px]`}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] text-fg-muted">기대 반환값 (JSON)</label>
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
      </Step>

      {state.errors && state.errors.length > 0 && (
        <div className="rounded-[var(--radius-panel)] border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-rose-800">등록할 수 없습니다</p>
          <ul className="list-inside list-disc space-y-0.5 text-[11px] text-rose-700">
            {state.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 제출 — 눌러 보고 알게 하지 않는다. 빠진 것이 있으면 여기서 먼저 말한다. */}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline bg-paper/95 px-1 py-3 backdrop-blur">
        <button type="submit" disabled={pending || hasCaseError || missing.length > 0} className={BTN_PRIMARY}>
          {pending ? '저장 중…' : defaults ? '수정 저장' : '문제 은행에 등록'}
        </button>
        {hasCaseError ? (
          <p className="text-xs text-rose-600">테스트케이스 JSON을 먼저 고쳐 주세요.</p>
        ) : missing.length > 0 ? (
          <p className="text-xs text-amber-700">아직 비어 있습니다 — {missing.join(' · ')}</p>
        ) : (
          <p className="text-xs text-fg-muted">
            지문 {description.trim().length.toLocaleString()}자 · 언어{' '}
            {languages.map((l) => LANGUAGE_LABELS[l]).join('·')} · 케이스 {cases.length}개
          </p>
        )}
      </div>
    </form>
  );
}
