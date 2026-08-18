// 문제 업로드 스키마 — 콘솔 폼과 JSON 일괄 등록이 같은 검증을 쓴다.
//
// 서버 액션과 화면이 각자 검증하면 반드시 어긋난다. 미리보기에서 통과한 JSON이
// 저장에서 거절되면 운영자는 무엇이 문제인지 알 수 없다.
import { z } from 'zod';

export const PROBLEM_CATEGORIES = ['해시', '스택', 'DP', '그리디', '그래프', '자료구조'] as const;
export const PROBLEM_LANGUAGES = ['javascript', 'python'] as const;

export const DIFFICULTY_LABEL: Record<number, string> = {
  1: '입문',
  2: '초급',
  3: '중급',
  4: '고급',
};

/**
 * 테스트케이스 — input은 **인자 배열**이다.
 * `[[2,7,11,15], 9]`는 인자 두 개(배열 하나 + 숫자 하나)라는 뜻이다.
 * 이걸 오해해서 `[2,7,11,15]`로 넣으면 인자 네 개가 되어 채점이 전부 실패한다.
 */
export const testCaseSchema = z.object({
  input: z.array(z.unknown()).min(1, '입력은 인자 배열이어야 합니다. 예: [[2,7,11,15], 9]'),
  expected: z.unknown(),
  isHidden: z.boolean().optional().default(false),
  order: z.number().int().min(0).optional(),
});

export const problemImportSchema = z.object({
  title: z.string().trim().min(2, '제목은 2자 이상이어야 합니다.').max(120),
  difficulty: z.coerce.number().int().min(1).max(4),
  category: z.enum(PROBLEM_CATEGORIES),
  description: z.string().trim().min(10, '문제 설명은 10자 이상이어야 합니다.').max(20000),
  tags: z.array(z.string().trim().min(1)).max(10).optional().default([]),
  timeLimitMs: z.coerce.number().int().min(500).max(20000).optional().default(3000),
  // 언어별 스타터 코드 — 둘 다 선택. 한 언어만 올리는 문제도 있다.
  starterCodes: z
    .object({
      javascript: z.string().max(5000).optional(),
      python: z.string().max(5000).optional(),
    })
    .optional()
    .default({}),
  keywords: z.array(z.string().trim().min(1)).max(20).optional().default([]),
  company: z.string().trim().max(60).optional().nullable(),
  examYear: z.string().trim().max(10).optional().nullable(),
  // 테스트케이스가 없으면 채점이 성립하지 않는다. 초안 단계에서도 최소 1개를 요구한다 —
  // 예전에는 "검토 과정에서 보완"으로 미뤄 두고 결국 0개짜리 문제가 게시됐다.
  testCases: z.array(testCaseSchema).min(1, '테스트케이스는 최소 1개가 필요합니다.').max(50),
});

export type ProblemImport = z.infer<typeof problemImportSchema>;

/** JSON 일괄 등록 — 배열 또는 { problems: [...] } 둘 다 받는다. */
export const bulkImportSchema = z.union([
  z.array(problemImportSchema).min(1).max(50),
  z.object({ problems: z.array(problemImportSchema).min(1).max(50) }).transform((v) => v.problems),
]);

/** 슬러그 — 제목 기반 + 타임스탬프. 같은 제목이 두 번 올라와도 충돌하지 않는다. */
export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'problem'}-${Date.now().toString(36)}`;
}

/** 화면에 붙여 넣을 예시 — 형식을 글로 설명하는 것보다 이게 빠르다. */
export const IMPORT_EXAMPLE = JSON.stringify(
  [
    {
      title: '두 수의 합',
      difficulty: 1,
      category: '해시',
      description:
        '## 문제\n정수 배열 `nums`와 정수 `target`이 주어질 때, 합이 `target`이 되는 두 수의 인덱스를 반환하세요.\n\n## 제약\n- 2 <= nums.length <= 10^4\n\n## 예시\n입력: nums = [2,7,11,15], target = 9\n출력: [0,1]',
      tags: ['배열', '해시맵'],
      timeLimitMs: 3000,
      starterCodes: {
        javascript: 'function solution(nums, target) {\n  // 여기에 작성\n}',
        python: 'def solution(nums, target):\n    # 여기에 작성\n    pass',
      },
      keywords: ['해시맵', '시간복잡도', '한 번 순회'],
      testCases: [
        { input: [[2, 7, 11, 15], 9], expected: [0, 1], isHidden: false },
        { input: [[3, 2, 4], 6], expected: [1, 2], isHidden: true },
      ],
    },
  ],
  null,
  2,
);

/** 오류 메시지를 "몇 번째 문제의 어느 필드"로 읽히게 만든다. */
export function formatImportIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 20).map((issue) => {
    const path = issue.path;
    const index = typeof path[0] === 'number' ? `${path[0] + 1}번째 문제` : null;
    const field = path.slice(index ? 1 : 0).join('.');
    return [index, field || null, issue.message].filter(Boolean).join(' · ');
  });
}
