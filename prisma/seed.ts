import { PrismaClient, Prisma } from '../app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// service_role 키로 auth.users를 직접 생성 — RLS/이메일 확인 절차를 우회한다 (시드 전용).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

interface SeedProblem {
  slug: string;
  title: string;
  difficulty: number;
  category: string;
  tags: string[];
  description: string;
  timeLimitMs?: number;
  starterCodes: { javascript: string; python: string };
  keywords: string[];
  company?: string;
  testCases: Array<{ input: unknown[]; expected: unknown; isHidden?: boolean }>;
}

const problems: SeedProblem[] = [
  {
    slug: 'two-sum',
    title: '두 수의 합',
    difficulty: 1,
    category: '해시',
    tags: ['배열', '해시 맵'],
    description: `## 문제

정수 배열 \`nums\`와 정수 \`target\`이 주어집니다. 두 수의 합이 \`target\`이 되는 **서로 다른 두 원소의 인덱스**를 배열로 반환하세요.

정답은 항상 정확히 하나 존재하며, 같은 원소를 두 번 사용할 수 없습니다.

## 입력

- \`nums\`: 정수 배열 (2 ≤ 길이 ≤ 10,000)
- \`target\`: 정수

## 반환

- 두 인덱스를 담은 배열 \`[i, j]\` (i < j)

## 예제

| nums | target | 반환 |
|---|---|---|
| \`[2, 7, 11, 15]\` | \`9\` | \`[0, 1]\` |
| \`[3, 2, 4]\` | \`6\` | \`[1, 2]\` |

## 힌트

이중 반복문으로도 풀 수 있지만, 입력이 커지면 어떻게 될까요? 면접관이 그냥 넘어가지 않을지도 모릅니다.`,
    starterCodes: {
      javascript: `function solution(nums, target) {
  // 여기에 코드를 작성하세요
}`,
      python: `def solution(nums, target):
    # 여기에 코드를 작성하세요
    pass`,
    },
    keywords: ['해시', 'O(n)', '시간복잡도', '공간복잡도', '한 번의 순회', '트레이드오프'],
    testCases: [
      { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { input: [[3, 2, 4], 6], expected: [1, 2] },
      { input: [[3, 3], 6], expected: [0, 1], isHidden: true },
      { input: [[1, 5, -2, 8], 6], expected: [0, 1], isHidden: true },
      { input: [[-3, 4, 90, 7], 4], expected: [0, 3], isHidden: true },
    ],
  },
  {
    slug: 'valid-parentheses',
    title: '올바른 괄호',
    difficulty: 1,
    category: '스택',
    tags: ['문자열', '스택'],
    description: `## 문제

\`(\`, \`)\`, \`{\`, \`}\`, \`[\`, \`]\`로만 이루어진 문자열 \`s\`가 주어집니다. 괄호가 올바르게 짝지어졌는지 판별하세요.

올바른 괄호란:
1. 여는 괄호는 같은 종류의 닫는 괄호로 닫혀야 합니다.
2. 여는 괄호는 올바른 순서로 닫혀야 합니다.

## 입력

- \`s\`: 괄호 문자열 (0 ≤ 길이 ≤ 10,000)

## 반환

- 올바르면 \`true\`, 아니면 \`false\`

## 예제

| s | 반환 |
|---|---|
| \`"()[]{}"\` | \`true\` |
| \`"(]"\` | \`false\` |
| \`"([)]"\` | \`false\` |

## 힌트

빈 문자열이 들어오면 어떻게 처리해야 할까요? 닫는 괄호가 먼저 나오면요?`,
    starterCodes: {
      javascript: `function solution(s) {
  // 여기에 코드를 작성하세요
}`,
      python: `def solution(s):
    # 여기에 코드를 작성하세요
    pass`,
    },
    keywords: ['스택', 'LIFO', '엣지 케이스', '빈 문자열', 'O(n)', '후입선출'],
    testCases: [
      { input: ['()[]{}'], expected: true },
      { input: ['(]'], expected: false },
      { input: ['([)]'], expected: false, isHidden: true },
      { input: ['{[]}'], expected: true, isHidden: true },
      { input: [''], expected: true, isHidden: true },
      { input: [')('], expected: false, isHidden: true },
    ],
  },
  {
    slug: 'fibonacci-dp',
    title: '피보나치 수',
    difficulty: 2,
    category: 'DP',
    tags: ['동적 계획법', '재귀'],
    description: `## 문제

피보나치 수열은 다음과 같이 정의됩니다.

- F(0) = 0, F(1) = 1
- F(n) = F(n-1) + F(n-2) (n ≥ 2)

정수 \`n\`이 주어질 때 \`F(n)\`을 반환하세요.

## 입력

- \`n\`: 정수 (0 ≤ n ≤ 40)

## 반환

- n번째 피보나치 수

## 예제

| n | 반환 |
|---|---|
| \`10\` | \`55\` |
| \`20\` | \`6765\` |

## 힌트

단순 재귀로 풀면 n이 커질 때 시간 제한에 걸릴 수 있습니다. 같은 값을 몇 번이나 다시 계산하고 있나요?`,
    timeLimitMs: 3000,
    starterCodes: {
      javascript: `function solution(n) {
  // 여기에 코드를 작성하세요
}`,
      python: `def solution(n):
    # 여기에 코드를 작성하세요
    pass`,
    },
    keywords: ['메모이제이션', 'DP', '중복 계산', 'O(n)', '바텀업', '재귀 깊이', '지수 시간'],
    testCases: [
      { input: [10], expected: 55 },
      { input: [1], expected: 1 },
      { input: [0], expected: 0, isHidden: true },
      { input: [20], expected: 6765, isHidden: true },
      { input: [35], expected: 9227465, isHidden: true },
    ],
  },
  {
    slug: 'max-subarray',
    title: '최대 부분합',
    difficulty: 2,
    category: 'DP',
    tags: ['배열', '카데인 알고리즘'],
    description: `## 문제

정수 배열 \`nums\`가 주어집니다. 합이 최대가 되는 **연속 부분 배열**을 찾아 그 합을 반환하세요.

## 입력

- \`nums\`: 정수 배열 (1 ≤ 길이 ≤ 100,000, 원소는 음수 가능)

## 반환

- 최대 연속 부분합 (정수)

## 예제

| nums | 반환 | 설명 |
|---|---|---|
| \`[-2,1,-3,4,-1,2,1,-5,4]\` | \`6\` | \`[4,-1,2,1]\` |
| \`[5,4,-1,7,8]\` | \`23\` | 전체 |

## 힌트

모든 원소가 음수라면 어떻게 될까요? 모든 (i, j) 구간을 다 확인해야만 할까요?`,
    starterCodes: {
      javascript: `function solution(nums) {
  // 여기에 코드를 작성하세요
}`,
      python: `def solution(nums):
    # 여기에 코드를 작성하세요
    pass`,
    },
    keywords: ['카데인', 'DP', 'O(n)', '누적합', '음수', '점화식'],
    testCases: [
      { input: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
      { input: [[1]], expected: 1 },
      { input: [[5, 4, -1, 7, 8]], expected: 23, isHidden: true },
      { input: [[-1, -2, -3]], expected: -1, isHidden: true },
      { input: [[-5]], expected: -5, isHidden: true },
    ],
  },
  {
    slug: 'meeting-rooms',
    title: '회의실 배정',
    difficulty: 3,
    category: '그리디',
    tags: ['정렬', '그리디'],
    company: '카카오',
    description: `## 문제

회의실이 하나 있습니다. 각 회의의 \`[시작 시간, 종료 시간]\`이 담긴 배열 \`meetings\`가 주어질 때, 겹치지 않게 진행할 수 있는 **회의의 최대 개수**를 반환하세요.

한 회의가 끝나는 시각에 다른 회의가 바로 시작할 수 있습니다.

## 입력

- \`meetings\`: \`[start, end]\` 쌍의 배열 (0 ≤ 길이 ≤ 100,000)

## 반환

- 최대 회의 개수 (정수)

## 예제

| meetings | 반환 | 설명 |
|---|---|---|
| \`[[1,3],[2,4],[3,5]]\` | \`2\` | \`[1,3]\`, \`[3,5]\` |
| \`[[1,4],[2,3],[3,5],[6,8]]\` | \`3\` | \`[2,3]\`, \`[3,5]\`, \`[6,8]\` |

## 힌트

무엇을 기준으로 정렬해야 할까요? 시작 시간? 종료 시간? 왜 그 선택이 항상 최적일까요 — 증명할 수 있나요?`,
    starterCodes: {
      javascript: `function solution(meetings) {
  // 여기에 코드를 작성하세요
}`,
      python: `def solution(meetings):
    # 여기에 코드를 작성하세요
    pass`,
    },
    keywords: ['그리디', '정렬', '종료 시간', '교환 논증', 'O(n log n)', '반례'],
    testCases: [
      { input: [[[1, 3], [2, 4], [3, 5]]], expected: 2 },
      { input: [[[1, 4], [2, 3], [3, 5], [6, 8]]], expected: 3 },
      { input: [[[5, 9], [1, 2], [3, 4], [0, 6], [5, 7], [8, 9]]], expected: 4, isHidden: true },
      { input: [[]], expected: 0, isHidden: true },
      { input: [[[1, 2]]], expected: 1, isHidden: true },
    ],
  },
  {
    slug: 'number-of-islands',
    title: '섬의 개수',
    difficulty: 3,
    category: '그래프',
    tags: ['BFS', 'DFS', '2차원 배열'],
    company: '네이버',
    description: `## 문제

\`1\`(땅)과 \`0\`(물)로 이루어진 2차원 격자 \`grid\`가 주어집니다. **섬의 개수**를 반환하세요.

섬은 상하좌우로 연결된 땅의 묶음이며, 격자의 바깥은 모두 물로 둘러싸여 있다고 가정합니다.

## 입력

- \`grid\`: 0/1 2차원 배열 (1 ≤ 행, 열 ≤ 300)

## 반환

- 섬의 개수 (정수)

## 예제

\`\`\`
[[1,1,0,0],
 [1,0,0,1],
 [0,0,1,1]]
→ 3
\`\`\`

## 힌트

BFS와 DFS 중 무엇을 선택하시겠어요? 격자가 아주 커지면 재귀 DFS에는 어떤 위험이 있을까요?`,
    starterCodes: {
      javascript: `function solution(grid) {
  // 여기에 코드를 작성하세요
}`,
      python: `def solution(grid):
    # 여기에 코드를 작성하세요
    pass`,
    },
    keywords: ['BFS', 'DFS', '방문 체크', '재귀 깊이', '스택 오버플로우', 'O(NM)', '큐'],
    testCases: [
      { input: [[[1, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 1]]], expected: 3 },
      { input: [[[1, 1, 1], [0, 1, 0], [1, 1, 1]]], expected: 1 },
      { input: [[[0, 0], [0, 0]]], expected: 0, isHidden: true },
      { input: [[[1, 0, 1], [0, 1, 0], [1, 0, 1]]], expected: 5, isHidden: true },
      { input: [[[1]]], expected: 1, isHidden: true },
    ],
  },
  {
    slug: 'lru-cache-lite',
    title: '최근 사용 기록',
    difficulty: 4,
    category: '자료구조',
    tags: ['해시 맵', 'LRU', '설계'],
    company: '토스',
    description: `## 문제

용량이 \`capacity\`인 **LRU(Least Recently Used) 캐시**를 시뮬레이션하세요.

연산 목록 \`ops\`가 주어집니다.

- \`["put", key, value]\`: 키-값 저장. 용량 초과 시 **가장 오래 사용되지 않은** 키를 제거.
- \`["get", key]\`: 값을 조회. 없으면 \`-1\`. 조회도 "사용"으로 취급.

모든 \`get\` 연산의 결과를 순서대로 배열에 담아 반환하세요.

## 입력

- \`capacity\`: 양의 정수 (1 ≤ capacity ≤ 100)
- \`ops\`: 연산 배열 (1 ≤ 길이 ≤ 1,000)

## 반환

- \`get\` 결과의 배열

## 예제

\`\`\`
capacity = 2
ops = [["put",1,1],["put",2,2],["get",1],["put",3,3],["get",2],["get",3]]
→ [1, -1, 3]
\`\`\`
(put 3 시점에 용량 초과 → 가장 오래된 2가 제거됨)

## 힌트

get과 put을 모두 빠르게 하려면 어떤 자료구조 조합이 필요할까요? 삽입 순서를 기억하는 자료구조가 있나요?`,
    starterCodes: {
      javascript: `function solution(capacity, ops) {
  // 여기에 코드를 작성하세요
}`,
      python: `def solution(capacity, ops):
    # 여기에 코드를 작성하세요
    pass`,
    },
    keywords: ['해시 맵', 'LRU', 'O(1)', '연결 리스트', 'Map', 'OrderedDict', '삽입 순서', '트레이드오프'],
    testCases: [
      {
        input: [2, [['put', 1, 1], ['put', 2, 2], ['get', 1], ['put', 3, 3], ['get', 2], ['get', 3]]],
        expected: [1, -1, 3],
      },
      {
        input: [1, [['put', 1, 1], ['get', 1], ['put', 2, 2], ['get', 1], ['get', 2]]],
        expected: [1, -1, 2],
      },
      {
        input: [
          2,
          [
            ['put', 1, 1], ['put', 2, 2], ['get', 1], ['put', 3, 3], ['get', 2],
            ['put', 4, 4], ['get', 1], ['get', 3], ['get', 4],
          ],
        ],
        expected: [1, -1, -1, 3, 4],
        isHidden: true,
      },
      { input: [2, [['get', 9], ['put', 5, 10], ['get', 5]]], expected: [-1, 10], isHidden: true },
    ],
  },
];

async function main() {
  console.log('🌱 시드 시작…');

  // 초기화 (역참조 순서대로 삭제)
  await prisma.post.deleteMany();
  await prisma.interviewSession.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.problem.deleteMany();
  await prisma.user.deleteMany();

  // 기존 데모 auth 계정이 있으면 삭제 (재시드 멱등성 확보 — public.User는 FK cascade로 함께 삭제됨)
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingDemo = existingUsers?.users.find((u) => u.email === 'demo@debate.code');
  if (existingDemo) {
    await supabaseAdmin.auth.admin.deleteUser(existingDemo.id);
  }

  const created: Record<string, number> = {};
  for (const p of problems) {
    const problem = await prisma.problem.create({
      data: {
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        category: p.category,
        tags: p.tags as Prisma.InputJsonValue,
        description: p.description,
        timeLimitMs: p.timeLimitMs ?? 3000,
        starterCodes: p.starterCodes as Prisma.InputJsonValue,
        keywords: p.keywords as Prisma.InputJsonValue,
        company: p.company ?? null,
        testCases: {
          create: p.testCases.map((tc, i) => ({
            input: tc.input as Prisma.InputJsonValue,
            expected: tc.expected as Prisma.InputJsonValue,
            isHidden: tc.isHidden ?? false,
            order: i,
          })),
        },
      },
    });
    created[p.slug] = problem.id;
    console.log(`  ✓ 문제 #${problem.id} ${p.title}`);
  }

  // 데모 유저(Supabase Auth) + 완료된 면접 2건 (대시보드 데모용)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: 'demo@debate.code',
    password: 'demo1234',
    email_confirm: true,
    user_metadata: { name: '데모 유저' },
  });
  if (authError || !authData.user) throw authError ?? new Error('데모 유저 생성 실패');

  // on_auth_user_created 트리거가 public.User 행을 만들 때까지 잠깐 대기
  await new Promise((r) => setTimeout(r, 300));
  const demo = await prisma.user.update({
    where: { id: authData.user.id },
    data: { role: 'admin' },
  });

  const demoInterviews = [
    {
      slug: 'two-sum',
      language: 'javascript',
      code: `function solution(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
}`,
      runtimeMs: 2,
      defenseScore: 84,
      report: {
        defenseScore: 84,
        rounds: [
          {
            round: 1,
            question: '이 코드의 시간 복잡도는 어떻게 되나요? 입력이 10⁶개여도 통과할까요?',
            answer: '해시 맵을 사용해 한 번의 순회로 처리하므로 O(n)입니다. 10⁶개도 문제없습니다.',
            verdict: 'DEFENDED',
            score: 92,
            feedback: '복잡도와 근거를 정확히 제시했습니다.',
            matchedKeywords: ['해시', 'O(n)', '한 번의 순회'],
            missedKeywords: [],
          },
          {
            round: 2,
            question: 'Map 대신 객체({})를 쓰면 어떤 차이가 있나요?',
            answer: '객체는 키가 문자열로 변환되고, Map이 삽입 순서 보장과 성능 면에서 낫습니다.',
            verdict: 'DEFENDED',
            score: 80,
            feedback: '키 변환 이슈를 짚었습니다.',
            matchedKeywords: ['Map'],
            missedKeywords: ['공간복잡도'],
          },
          {
            round: 3,
            question: '공간 복잡도를 희생하면서까지 해시 맵을 써야 했던 이유는요?',
            answer: '시간이 더 중요하다고 판단했습니다.',
            verdict: 'PARTIAL',
            score: 55,
            feedback: '트레이드오프의 구체적 근거(입력 규모, 메모리 여유)까지 설명하면 좋습니다.',
            matchedKeywords: [],
            missedKeywords: ['트레이드오프', '공간복잡도'],
          },
        ],
        summary: '복잡도 방어는 훌륭했으나 공간-시간 트레이드오프 논증이 아쉬웠습니다.',
        weakKeywords: ['트레이드오프', '공간복잡도'],
        strongKeywords: ['해시', 'O(n)', '한 번의 순회'],
      },
    },
    {
      slug: 'valid-parentheses',
      language: 'python',
      code: `def solution(s):
    stack = []
    pairs = {')': '(', ']': '[', '}': '{'}
    for ch in s:
        if ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
        else:
            stack.append(ch)
    return not stack`,
      runtimeMs: 4,
      defenseScore: 62,
      report: {
        defenseScore: 62,
        rounds: [
          {
            round: 1,
            question: '왜 스택을 선택하셨나요? 다른 자료구조로는 안 되나요?',
            answer: '가장 최근에 열린 괄호부터 닫혀야 하므로 LIFO 구조인 스택이 자연스럽습니다.',
            verdict: 'DEFENDED',
            score: 85,
            feedback: 'LIFO 특성과 문제의 구조를 정확히 연결했습니다.',
            matchedKeywords: ['스택', 'LIFO'],
            missedKeywords: [],
          },
          {
            round: 2,
            question: '빈 문자열이 들어오면 어떻게 동작하나요?',
            answer: '루프가 안 돌고 True가 반환됩니다.',
            verdict: 'PARTIAL',
            score: 50,
            feedback: '동작은 맞지만, 문제 정의상 빈 문자열을 올바른 것으로 볼지 근거가 필요합니다.',
            matchedKeywords: ['빈 문자열'],
            missedKeywords: ['엣지 케이스'],
          },
          {
            round: 3,
            question: '닫는 괄호가 먼저 나오는 경우의 방어 로직을 설명해 보세요.',
            answer: '스택이 비어있으면 False요.',
            verdict: 'CONCEDED',
            score: 35,
            feedback: '코드의 어느 줄이 그 역할을 하는지, 왜 필요한지 구체적으로 짚어야 합니다.',
            matchedKeywords: [],
            missedKeywords: ['엣지 케이스', '후입선출'],
          },
        ],
        summary: '자료구조 선택 논리는 좋았으나 엣지 케이스 방어 설명이 부족했습니다.',
        weakKeywords: ['엣지 케이스', '후입선출'],
        strongKeywords: ['스택', 'LIFO'],
      },
    },
  ] as const;

  for (const d of demoInterviews) {
    const submission = await prisma.submission.create({
      data: {
        userId: demo.id,
        problemId: created[d.slug],
        code: d.code,
        language: d.language,
        status: 'PASS',
        passedCount: problems.find((p) => p.slug === d.slug)!.testCases.length,
        totalCount: problems.find((p) => p.slug === d.slug)!.testCases.length,
        runtimeMs: d.runtimeMs,
      },
    });
    await prisma.interviewSession.create({
      data: {
        submissionId: submission.id,
        userId: demo.id,
        status: 'COMPLETED',
        round: d.report.rounds.length,
        messages: d.report.rounds.flatMap((r, i) => [
          { role: 'ai', content: r.question, round: i + 1, ts: Date.now() },
          { role: 'user', content: r.answer, round: i + 1, ts: Date.now() },
        ]) as Prisma.InputJsonValue,
        report: d.report as Prisma.InputJsonValue,
        defenseScore: d.defenseScore,
        weakKeywords: d.report.weakKeywords,
      },
    });
    console.log(`  ✓ 데모 면접: ${d.slug} (${d.defenseScore}점)`);
  }

  // 커뮤니티 시드 게시글
  await prisma.post.createMany({
    data: [
      {
        board: 'free',
        title: '디베이트코드 첫 면접 후기 — 방어 성공률 84% 달성!',
        content:
          '두 수의 합 문제로 첫 면접을 봤는데, 트레이드오프 질문에서 말문이 막히더라고요. 코드는 맞혔는데 설명을 못 하니 정말 면접 보는 기분이었습니다. 다들 몇 %까지 올리셨나요?',
        authorId: demo.id,
      },
      {
        board: 'mentor',
        title: '[멘토] 그리디 정당성 증명, 이렇게 설명하세요',
        content:
          '면접에서 "왜 그리디가 최적인가요?"라는 질문을 받으면 교환 논증(exchange argument)으로 답하는 것이 정석입니다. 최적해가 그리디 선택과 다르다고 가정하고, 교환해도 손해가 없음을 보이면 됩니다.',
        authorId: demo.id,
      },
      {
        board: 'qna',
        title: 'Python 첫 실행이 느린데 정상인가요?',
        content:
          'Python을 선택하면 처음에 런타임을 불러온다고 몇 초 걸리네요. 브라우저에서 Pyodide를 로드해서 그렇다고 들었는데 맞나요? 두 번째 실행부터는 빠릅니다.',
        authorId: demo.id,
      },
      {
        board: 'market',
        title: '[판매] 알고리즘 문제 해결 전략 1, 2권 세트',
        content: '깨끗하게 본 알고리즘 문제 해결 전략 세트 판매합니다. 직거래는 서울 강남역 인근, 택배 가능.',
        authorId: demo.id,
      },
    ],
  });
  console.log('  ✓ 커뮤니티 게시글 4건');

  console.log('🌱 시드 완료 — demo@debate.code / demo1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
