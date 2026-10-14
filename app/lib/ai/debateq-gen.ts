// debateQ 결함 코드 생성기 — AI가 "동작하는 듯하지만 결함 있는" 풀이를 만들어 준다.
// 빌트인 실모델(env 키)이 있으면 LLM으로 생성하고, 없으면 카테고리별 규칙 템플릿으로 폴백한다.
import type { Language } from '@/app/lib/types';
import { llmChat } from './llm-interviewer';
import { getBuiltinLlmConfig } from './builtin';
import { builtinChatOptions } from './builtin';

export interface FlawedCode {
  code: string;
  flawHints: string[]; // 심어진 결함 요약 (면접관 평가 컨텍스트용 — 사용자에게 직접 노출하지 않음)
  source: 'llm' | 'template';
}

interface ProblemInput {
  title: string;
  category: string;
  description: string;
  keywords: string[];
}

const GEN_SYSTEM = `당신은 debateCode의 debateQ 출제 엔진입니다.
주어진 알고리즘 문제에 대해 "언뜻 보면 그럴듯하지만 결함이 있는" 풀이 코드를 생성합니다.
결함은 2~3개: 시간복잡도 비효율(예: 불필요한 이중 루프), 엣지 케이스 누락, 미묘한 로직 버그 중에서 섞으세요.
코드는 컴파일/실행 가능한 형태여야 하고, 결함은 자연스러워야 합니다(주석으로 힌트 금지).`;

function genUserPrompt(problem: ProblemInput, language: Language, starterCode: string): string {
  return `문제: ${problem.title} (${problem.category})
설명:
${problem.description.slice(0, 2000)}

언어: ${language}
함수 시그니처(스타터 코드):
\`\`\`
${starterCode}
\`\`\`

다음 JSON 형식으로만 답하세요:
{"code": "<결함이 심어진 완성 코드>", "flaws": ["결함1 요약", "결함2 요약"]}`;
}

function extractJson(text: string): { code?: string; flaws?: string[] } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/* ---------- 규칙 템플릿 폴백 ---------- */

// 시드 해시 — 같은 문제/사용자여도 재도전 시 다른 변형이 나오도록 결정적 선택에 사용
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 스타터 코드의 함수 본문에 결함 있는 구현을 채워 넣는다.
// 실제로 정답일 필요는 없다 — debateQ는 채점이 아니라 "결함 발견→수정→변론"이 목적.
function templateFlawedCode(problem: ProblemInput, language: Language, starterCode: string, seed: string): FlawedCode {
  const variant = hashSeed(seed) % 3;

  const jsBodies = [
    {
      body: `  // 전체 쌍을 비교해 조건을 찾는다
  const result = [];
  for (let i = 0; i < input.length; i++) {
    for (let j = 0; j < input.length; j++) {
      if (i !== j && check(input[i], input[j])) result.push([i, j]);
    }
  }
  return result[0];

  function check(a, b) {
    return a + b === target;
  }`,
      flaws: ['이중 루프 O(n²) — 해시맵으로 O(n) 개선 여지', 'j를 0부터 돌아 중복 쌍/자기 자신 재검사', '결과가 없을 때 undefined 반환(엣지 케이스 미처리)'],
    },
    {
      body: `  const sorted = [...input].sort();
  let answer = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i] === sorted[i + 1]) answer++;
  }
  return answer;`,
      flaws: ['sort()에 비교 함수 누락 — 숫자를 문자열로 정렬', '빈 배열/단일 원소 엣지 케이스 미검증', '정렬 O(n log n) 대신 집합으로 O(n) 가능'],
    },
    {
      body: `  let result = 0;
  for (let i = 1; i <= n; i++) {
    result += solve(i);
  }
  return result;

  function solve(k) {
    if (k <= 1) return k;
    return solve(k - 1) + solve(k - 2);
  }`,
      flaws: ['메모이제이션 없는 중복 재귀 — 지수 시간', 'n=0 등 경계값 처리 불명확', '반복문+재귀 중첩으로 불필요한 재계산'],
    },
  ];

  const pyBodies = [
    {
      body: `    result = []
    for i in range(len(input_data)):
        for j in range(len(input_data)):
            if i != j and input_data[i] + input_data[j] == target:
                result.append([i, j])
    return result[0]`,
      flaws: ['이중 루프 O(n²) — 딕셔너리로 O(n) 개선 여지', 'j를 0부터 돌아 중복 쌍 재검사', '결과가 없을 때 IndexError(엣지 케이스 미처리)'],
    },
    {
      body: `    sorted_data = sorted(input_data)
    answer = 0
    for i in range(len(sorted_data) - 1):
        if sorted_data[i] == sorted_data[i + 1]:
            answer += 1
    return answer`,
      flaws: ['정렬 O(n log n) 대신 set으로 O(n) 가능', '빈 입력 엣지 케이스 미검증', '중복이 3개 이상일 때 계산 방식 모호'],
    },
    {
      body: `    def solve(k):
        if k <= 1:
            return k
        return solve(k - 1) + solve(k - 2)

    return sum(solve(i) for i in range(1, n + 1))`,
      flaws: ['메모이제이션 없는 중복 재귀 — 지수 시간', 'n=0 경계값 처리 불명확', '매 i마다 재계산 — 누적 캐시로 개선 여지'],
    },
  ];

  const chosen = language === 'python' ? pyBodies[variant] : jsBodies[variant];

  // 스타터 코드의 함수 골격을 유지하고 본문만 결함 구현으로 교체
  let code: string;
  if (language === 'python') {
    const defLine = starterCode.split('\n').find((l) => l.trimStart().startsWith('def ')) ?? 'def solution(input_data, target=None, n=10):';
    code = `${defLine}\n${chosen.body}\n`;
  } else {
    const fnLine = starterCode.split('\n').find((l) => /function\s+\w+\s*\(/.test(l)) ?? 'function solution(input, target, n) {';
    const header = fnLine.includes('{') ? fnLine : `${fnLine} {`;
    code = `${header}\n${chosen.body}\n}\n`;
  }

  return { code, flawHints: chosen.flaws, source: 'template' };
}

/* ---------- 진입점 ---------- */

export async function generateFlawedCode(
  problem: ProblemInput,
  language: Language,
  starterCode: string,
  seed: string,
): Promise<FlawedCode> {
  const llmConfig = getBuiltinLlmConfig();
  if (llmConfig) {
    try {
      const reply = await llmChat(llmConfig, GEN_SYSTEM, genUserPrompt(problem, language, starterCode), builtinChatOptions());
      const parsed = extractJson(reply);
      if (parsed?.code && parsed.code.trim().length > 20) {
        return {
          code: parsed.code,
          flawHints: Array.isArray(parsed.flaws) ? parsed.flaws.slice(0, 5) : [],
          source: 'llm',
        };
      }
    } catch {
      // LLM 실패 시 템플릿 폴백
    }
  }
  return templateFlawedCode(problem, language, starterCode, seed);
}
