// 목업 DebateAI — 휴리스틱 코드 분석 + 한국어 질문 템플릿 뱅크 + 답변 채점.
// 순수 함수 위주로 작성되어 단위 테스트 가능하며, 실제 LLM 프로바이더로 교체 가능.
import type {
  CodeAnalysis,
  DefenseReport,
  Language,
  ProblemMeta,
  RoundEval,
  RoundVerdict,
} from '@/app/lib/types';
import type {
  EvaluateContext,
  InterviewerProvider,
  QuestionContext,
} from './provider';

// ---------- 결정적 셔플 (submissionId 시드) ----------

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: T[], seed: string, salt: number): T {
  return items[(hashSeed(seed) + salt * 7919) % items.length];
}

// ---------- 코드 정적 분석 (휴리스틱) ----------

function stripCommentsAndStrings(code: string, language: Language): string {
  if (language === 'python') {
    return code
      .replace(/'''[\s\S]*?'''|"""[\s\S]*?"""/g, '')
      .replace(/#[^\n]*/g, '')
      .replace(/'[^'\n]*'|"[^"\n]*"/g, "''");
  }
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/`[^`]*`|'[^'\n]*'|"[^"\n]*"/g, "''");
}

function maxLoopDepthJs(code: string): number {
  // 중괄호 깊이를 추적하며 루프 키워드 등장 시점의 "루프 스택" 깊이를 센다
  let depth = 0;
  let maxDepth = 0;
  const loopStack: number[] = [];
  const tokens = code.split(/(\{|\})/);
  for (const tok of tokens) {
    if (tok === '{') depth++;
    else if (tok === '}') {
      depth--;
      while (loopStack.length && loopStack[loopStack.length - 1] >= depth) loopStack.pop();
    } else if (/\b(for|while)\b/.test(tok)) {
      loopStack.push(depth);
      maxDepth = Math.max(maxDepth, loopStack.length);
    }
  }
  return maxDepth;
}

function maxLoopDepthPy(code: string): number {
  // 들여쓰기 기반: 루프 라인의 indent를 스택으로 추적
  let maxDepth = 0;
  const stack: number[] = [];
  for (const line of code.split('\n')) {
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)![0].length;
    while (stack.length && stack[stack.length - 1] >= indent) stack.pop();
    if (/^\s*(for|while)\b/.test(line)) {
      stack.push(indent);
      maxDepth = Math.max(maxDepth, stack.length);
    }
  }
  return maxDepth;
}

export function analyzeCode(code: string, language: Language): CodeAnalysis {
  const clean = stripCommentsAndStrings(code, language);
  const maxLoopDepth = language === 'python' ? maxLoopDepthPy(clean) : maxLoopDepthJs(clean);

  // 재귀: 정의된 함수명이 본문에서 다시 호출되는지
  const fnNames =
    language === 'python'
      ? [...clean.matchAll(/def\s+(\w+)/g)].map((m) => m[1])
      : [
          ...clean.matchAll(/function\s+(\w+)/g),
          ...clean.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*=>/g),
        ].map((m) => m[1]);
  const usesRecursion = fnNames.some((name) => {
    const calls = [...clean.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))];
    return calls.length >= 2; // 정의부 외 재호출
  });

  const structures: string[] = [];
  if (/\bnew Map\b|dict\(|\{\s*\}/.test(clean) || (language === 'python' && /=\s*\{/.test(clean)))
    structures.push('해시 맵');
  if (/\bnew Set\b|set\(/.test(clean)) structures.push('집합(Set)');
  if (/\.sort\(|sorted\(/.test(clean)) structures.push('정렬');
  if (/\.push\(|\.pop\(|\.append\(/.test(clean)) structures.push('배열/스택');
  if (/\.shift\(|deque|queue/i.test(clean)) structures.push('큐');
  if (/OrderedDict|linked/i.test(clean)) structures.push('연결 자료구조');

  const hasEdgeGuard =
    /if\s*\(\s*!|\.length\s*===?\s*0|len\(\s*\w+\s*\)\s*==\s*0|not\s+\w+\b|is None|===?\s*null|===?\s*undefined|return\s+(?:-1|None|null|\[\]|false|False)/.test(
      clean,
    );

  const complexityGuess =
    maxLoopDepth >= 3
      ? 'O(n³) 이상'
      : maxLoopDepth === 2
        ? 'O(n²)'
        : usesRecursion
          ? '재귀 (메모이제이션 여부에 따라 지수~선형)'
          : /\.sort\(|sorted\(/.test(clean)
            ? 'O(n log n)'
            : maxLoopDepth === 1
              ? 'O(n)'
              : 'O(1)에 가까움';

  return {
    complexityGuess,
    maxLoopDepth,
    hasNestedLoops: maxLoopDepth >= 2,
    usesRecursion,
    structures,
    hasEdgeGuard,
    lineCount: code.split('\n').filter((l) => l.trim()).length,
  };
}

// ---------- 질문 템플릿 뱅크 ----------

type QuestionBuilder = (a: CodeAnalysis, p: ProblemMeta) => string;

const ROUND1_COMPLEXITY: QuestionBuilder[] = [
  (a) =>
    `제출하신 코드를 분석해 보니 시간 복잡도가 ${a.complexityGuess}로 보입니다. 직접 분석한 복잡도와 그 근거를 설명해 주시겠어요? 입력이 100만 개로 늘어나도 제한 시간 안에 통과할까요?`,
  (a) =>
    `이 코드의 시간 복잡도와 공간 복잡도를 각각 말씀해 주세요. ${a.hasNestedLoops ? '특히 중첩 반복문이 보이는데, 병목이 어디인지도 짚어 주시죠.' : '어느 부분이 병목이 될 수 있는지도 함께요.'}`,
];

const ROUND1_NESTED: QuestionBuilder[] = [
  () =>
    `중첩 반복문이 눈에 띄네요. 이 접근이 최선이라고 생각하시나요? 시간 복잡도를 한 단계 줄일 수 있는 다른 접근법은 없을까요?`,
  () =>
    `이중 루프 구조를 선택하셨는데, 입력 크기가 10⁵를 넘어가면 어떻게 될까요? 더 효율적인 대안과 그 트레이드오프를 설명해 보세요.`,
];

const ROUND1_RECURSION: QuestionBuilder[] = [
  () =>
    `재귀를 사용하셨네요. 이 재귀의 시간 복잡도는 어떻게 되나요? 같은 값을 중복 계산하고 있지는 않은지, 재귀 깊이 제한에 걸릴 위험은 없는지 설명해 주세요.`,
];

const ROUND2_STRUCTURE: Record<string, QuestionBuilder[]> = {
  '해시': [
    (a) =>
      a.structures.includes('해시 맵')
        ? `해시 맵을 선택하셨군요. 공간 복잡도를 희생하면서까지 해시를 써야 했던 명확한 이유가 있나요? 정렬 후 투 포인터 방식과 비교하면 어떤 트레이드오프가 있죠?`
        : `해시 맵을 쓰지 않고 푸셨네요. 해시 맵을 도입하면 어떤 이점과 비용이 생길까요?`,
  ],
  '스택': [
    () =>
      `이 문제에 스택이 적합한 이유를 자료구조의 특성(LIFO)과 연결해서 설명해 주세요. 큐로 풀면 왜 안 되나요?`,
  ],
  'DP': [
    (a) =>
      a.usesRecursion
        ? `탑다운(재귀+메모) 방식을 쓰셨는데, 바텀업 방식과 비교했을 때 장단점은 무엇인가요? 스택 오버플로우 위험은요?`
        : `이 문제의 점화식을 말로 정의해 보세요. 왜 이 부분 문제(subproblem) 정의가 최적 부분 구조를 만족하나요?`,
  ],
  '그리디': [
    () =>
      `그리디 선택이 항상 최적해를 보장한다는 걸 어떻게 확신하시나요? 교환 논증(exchange argument)이나 반례 검토로 정당성을 설명해 보세요.`,
    () =>
      `무엇을 기준으로 정렬하셨나요? 다른 기준(예: 시작 시간)으로 정렬하면 왜 실패하는지 반례를 들어 보시겠어요?`,
  ],
  '그래프': [
    (a) =>
      a.usesRecursion
        ? `재귀 DFS를 사용하셨네요. 격자가 300×300으로 커지면 재귀 깊이가 어디까지 갈 수 있죠? 스택 오버플로우를 피하려면 어떻게 바꿔야 하나요?`
        : `BFS와 DFS 중 이 방식을 선택한 이유는 무엇인가요? 메모리 사용 관점에서 두 방식의 차이를 설명해 주세요.`,
  ],
  '자료구조': [
    () =>
      `get과 put을 모두 O(1)에 가깝게 만들려면 어떤 자료구조 조합이 필요한가요? 지금 구현의 각 연산 복잡도를 정확히 분석해 보세요.`,
  ],
};

const ROUND2_FALLBACK: QuestionBuilder[] = [
  (a) =>
    `${a.structures.length ? `${a.structures.join(', ')}을(를) 사용하셨는데` : '지금 선택하신 자료구조로'} 이 선택의 트레이드오프를 설명해 주세요. 다른 자료구조였다면 무엇이 달라졌을까요?`,
];

const ROUND3_EDGE: QuestionBuilder[] = [
  (a) =>
    a.hasEdgeGuard
      ? `예외 처리가 일부 보이긴 합니다만, 빈 입력, 최소 크기 입력, 극단적인 값(음수, 매우 큰 수)이 들어왔을 때 각각 어떻게 동작하는지 코드를 근거로 설명해 주세요.`
      : `빈 배열이나 빈 문자열이 입력되면 이 코드는 어떻게 동작하나요? 지금 코드에는 명시적인 방어 로직이 보이지 않는데, 어디에서 보장되고 있죠?`,
  () =>
    `입력값의 경계 조건을 생각해 봅시다. 문제의 제한 범위에서 가장 위험한 입력은 무엇이고, 그 입력에서 코드가 안전하다는 근거는 무엇인가요?`,
];

const ROUND4_REFACTOR: QuestionBuilder[] = [
  () =>
    `마지막 질문입니다. 지금까지의 지적을 반영해 코드에서 딱 한 곳을 고친다면 어디를, 왜 고치시겠어요? 필요하다면 에디터에서 직접 수정하고 "코드 다시 실행"으로 증명하셔도 됩니다.`,
  () =>
    `면접을 마치기 전에, 이 코드를 프로덕션에 배포한다고 가정해 봅시다. 가독성·성능·안정성 중 가장 먼저 개선할 부분과 그 이유를 말씀해 주세요.`,
];

// ---------- 라운드별 기대 키워드 ----------

const ROUND_KEYWORDS: Record<number, string[]> = {
  1: ['시간복잡도', '공간복잡도', 'O(', '복잡도', '병목', '선형', '이차'],
  2: ['트레이드오프', '자료구조', '메모리', '공간', '시간', '대신', '비교'],
  3: ['엣지', '예외', '빈', '경계', 'null', 'None', '음수', '방어'],
  4: ['리팩토링', '가독성', '개선', '수정', '성능', '안정성'],
};

// ---------- 목업 면접관 ----------

export class MockInterviewer implements InterviewerProvider {
  analyze(code: string, language: Language): CodeAnalysis {
    return analyzeCode(code, language);
  }

  async nextQuestion(ctx: QuestionContext): Promise<string> {
    const { analysis, problem, round, seed, codeChanged } = ctx;

    const prefix = codeChanged
      ? pick(
          [
            '코드를 수정하셨군요. 변경 사항 확인했습니다. ',
            '방금 리팩터링하신 부분 확인했습니다. ',
          ],
          seed,
          round * 31,
        )
      : '';

    let builders: QuestionBuilder[];
    if (round === 1) {
      builders = analysis.hasNestedLoops
        ? ROUND1_NESTED
        : analysis.usesRecursion
          ? ROUND1_RECURSION
          : ROUND1_COMPLEXITY;
    } else if (round === 2) {
      builders = ROUND2_STRUCTURE[problem.category] ?? ROUND2_FALLBACK;
    } else if (round === 3) {
      builders = ROUND3_EDGE;
    } else {
      builders = ROUND4_REFACTOR;
    }

    return prefix + pick(builders, seed, round)(analysis, problem);
  }

  async evaluateAnswer(ctx: EvaluateContext): Promise<RoundEval> {
    const { question, answer, problem, round, code } = ctx;
    const normalized = answer.toLowerCase().replace(/\s+/g, '');

    // 1) 키워드 매칭 (60점)
    const expected = [...new Set([...problem.keywords, ...(ROUND_KEYWORDS[round] ?? [])])];
    const matched: string[] = [];
    const missed: string[] = [];
    for (const kw of expected) {
      if (normalized.includes(kw.toLowerCase().replace(/\s+/g, ''))) matched.push(kw);
      else missed.push(kw);
    }
    // 관련 키워드 중 상위 몇 개만 맞혀도 만점에 가깝게 (전부 요구하지 않음)
    const keywordScore = Math.min(60, Math.round((matched.length / Math.min(3, expected.length)) * 60));

    // 2) 논증 구조 (30점): 길이 + 이유 접속어
    const hasReasoning = /때문|이므로|이유는|근거|그래서|왜냐|따라서|하면|보장/.test(answer);
    const lengthScore = answer.trim().length >= 80 ? 15 : answer.trim().length >= 40 ? 10 : answer.trim().length >= 15 ? 5 : 0;
    const structureScore = lengthScore + (hasReasoning ? 15 : 0);

    // 3) 코드 요소 언급 (10점): 답변이 실제 코드의 식별자/구조를 언급하는가
    const codeTokens = [...new Set(code.match(/[a-zA-Z_]\w{2,}/g) ?? [])].filter(
      (t) => !['function', 'return', 'const', 'while', 'break', 'continue', 'range', 'def', 'None', 'True', 'False'].includes(t),
    );
    const mentionsCode =
      codeTokens.some((t) => answer.includes(t)) || /코드|함수|변수|반복문|루프|라인/.test(answer);
    const codeScore = mentionsCode ? 10 : 0;

    const score = Math.min(100, keywordScore + structureScore + codeScore);
    const verdict: RoundVerdict = score >= 70 ? 'DEFENDED' : score >= 40 ? 'PARTIAL' : 'CONCEDED';

    const feedback =
      verdict === 'DEFENDED'
        ? pick(
            [
              '논리적 근거와 핵심 개념을 정확히 짚었습니다. 훌륭한 방어였습니다.',
              '핵심 키워드와 근거가 명확했습니다. 실제 면접에서도 통할 답변입니다.',
            ],
            answer,
            round,
          )
        : verdict === 'PARTIAL'
          ? `방향은 맞지만 근거가 부족합니다. ${missed.slice(0, 2).join(', ')} 같은 개념을 엮어 구체적으로 설명했다면 더 강한 방어가 됐을 겁니다.`
          : `방어에 실패했습니다. 이 질문의 핵심은 ${missed.slice(0, 3).join(', ')}입니다. 코드의 어느 부분이 왜 그런지 근거를 들어 설명하는 연습이 필요합니다.`;

    return {
      round,
      question,
      answer,
      verdict,
      score,
      feedback,
      matchedKeywords: matched,
      missedKeywords: missed.slice(0, 4),
    };
  }

  async finalReport(
    rounds: RoundEval[],
    analysis: CodeAnalysis,
    problem: ProblemMeta,
  ): Promise<DefenseReport> {
    const defenseScore = Math.round(
      rounds.reduce((sum, r) => sum + r.score, 0) / Math.max(1, rounds.length),
    );
    const weakKeywords = [
      ...new Set(rounds.filter((r) => r.verdict !== 'DEFENDED').flatMap((r) => r.missedKeywords)),
    ].slice(0, 6);
    const strongKeywords = [...new Set(rounds.flatMap((r) => r.matchedKeywords))].slice(0, 6);

    const defended = rounds.filter((r) => r.verdict === 'DEFENDED').length;
    const summary =
      defenseScore >= 80
        ? `${rounds.length}번의 공방 중 ${defended}번을 성공적으로 방어했습니다. ${problem.category} 유형에 대한 이해와 논증 능력이 탄탄합니다. 실전 면접에서도 자신 있게 임하셔도 좋습니다.`
        : defenseScore >= 55
          ? `${rounds.length}번의 공방 중 ${defended}번을 방어했습니다. 개념은 알고 있지만 "왜"를 설명하는 논증의 깊이가 아쉽습니다. 약점 키워드를 중심으로 복습을 권합니다.`
          : `이번 면접에서는 방어가 어려웠습니다. ${problem.category} 유형의 핵심 개념(${weakKeywords.slice(0, 3).join(', ')})부터 다시 학습한 뒤 재도전해 보세요. 코드가 통과하는 것과 그것을 설명할 수 있는 것은 다른 능력입니다.`;

    return { defenseScore, rounds, summary, weakKeywords, strongKeywords };
  }
}
