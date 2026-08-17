// 문제 풀이 진입 경로(entry context).
//
// 같은 문제라도 "문제집 세트를 순서대로 풀던 중"인지 "문제집에서 개별 문제만 연 것"인지에 따라
// 완료 후 CTA가 달라진다. 경로는 URL 쿼리에 실어 새로고침/뒤로가기에도 유지한다.
//   /problems/12?from=set&set=kakao-2024   → SET
//   /problems/12                            → SINGLE

export interface ProblemEntryContext {
  source: 'SET' | 'SINGLE';
  setSlug?: string;
  setTitle?: string;
  /** 세트 종류 — exam(기출 모음) | mock(실전 모의고사) | theme(테마별) */
  setKind?: string;
  /** 세트 안에서의 0-기반 위치 */
  problemIndex?: number;
  totalInSet?: number;
  /** 다음 문제 id — 마지막 문제면 null */
  nextProblemId?: number | null;
  returnPath: string;
}

/**
 * 풀이 조건을 입장 전에 확정해야 하는 진입인가.
 *
 * 실전 모의고사(mock)만 해당한다 — 시험이니까 조건을 먼저 고정한다. 문제집에서 개별 문제를
 * 열거나 기출·테마 세트를 푸는 것은 연습이므로, 예전처럼 모드와 난이도를 그 자리에서 바꾼다.
 */
export function requiresSetup(entry: ProblemEntryContext): boolean {
  return entry.source === 'SET' && entry.setKind === 'mock';
}

/** 세트에서 문제를 열 때 붙일 쿼리 — 세트 상세에서 링크를 만들 때 쓴다. */
export function setEntryHref(problemId: number, setSlug: string): string {
  return `/problems/${problemId}?from=set&set=${encodeURIComponent(setSlug)}`;
}

/** searchParams에서 진입 경로를 읽는다. 세트 정보는 서버에서 채워 넣는다. */
export function readEntrySource(params: Record<string, string | string[] | undefined>): {
  source: 'SET' | 'SINGLE';
  setSlug?: string;
} {
  const from = typeof params.from === 'string' ? params.from : undefined;
  const setSlug = typeof params.set === 'string' ? params.set : undefined;
  if (from === 'set' && setSlug) return { source: 'SET', setSlug };
  return { source: 'SINGLE' };
}

export interface CompletionCta {
  label: string;
  href: string;
}

/**
 * 완료 후 CTA를 결정한다.
 * - 세트 진행 중 + 다음 문제 있음 → 다음 문제로
 * - 세트의 마지막 문제 → 세트로 돌아가기
 * - 개별 문제 → 문제집으로 돌아가기
 */
export function completionCta(entry: ProblemEntryContext): CompletionCta {
  if (entry.source === 'SET' && entry.nextProblemId != null && entry.setSlug) {
    return { label: '다음 문제로 넘어가기 →', href: setEntryHref(entry.nextProblemId, entry.setSlug) };
  }
  if (entry.source === 'SET' && entry.setSlug) {
    return { label: '문제집으로 돌아가기', href: `/contests/${entry.setSlug}` };
  }
  return { label: '문제집으로 돌아가기', href: entry.returnPath };
}
