'use server';

// 문제 에디터 서버 액션 — 관리자 전용.
// 테스트케이스의 input(인자 배열)/expected(기대 반환값)는 JSON으로 입력받아 저장한다.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../prisma';
import { getUser } from '../dal';

export interface ProblemFormState {
  errors?: {
    title?: string[];
    slug?: string[];
    difficulty?: string[];
    category?: string[];
    description?: string[];
    starterJs?: string[];
    starterPy?: string[];
    testCases?: string[];
    form?: string[];
  };
}

const problemSchema = z.object({
  title: z.string().trim().min(2, '제목은 2자 이상이어야 합니다.').max(80, '제목은 80자 이하여야 합니다.'),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, 'slug는 영문 소문자·숫자·하이픈만 사용할 수 있습니다.')
    .max(60)
    .optional()
    .or(z.literal('')),
  difficulty: z.coerce.number().int().min(1).max(4),
  category: z.string().trim().min(1, '카테고리를 입력해 주세요.').max(20),
  description: z.string().trim().min(20, '문제 설명은 20자 이상이어야 합니다.').max(20_000),
  timeLimitMs: z.coerce.number().int().min(500).max(30_000).default(3000),
  company: z.string().trim().max(30).optional().or(z.literal('')),
  examYear: z.string().trim().max(10).optional().or(z.literal('')),
  starterJs: z.string().trim().min(1, 'JavaScript 시작 코드를 입력해 주세요.').max(4000),
  starterPy: z.string().trim().min(1, 'Python 시작 코드를 입력해 주세요.').max(4000),
});

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[가-힣]/g, '') // 한글 제목이면 대부분 비게 되므로 아래 fallback 사용
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `problem-${Date.now()}`;
}

function parseCsv(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// 폼에서 문제 본문 + 테스트케이스를 파싱한다 — create/update 공용
function parseProblemForm(formData: FormData):
  | {
      data: z.infer<typeof problemSchema>;
      tags: string[];
      keywords: string[];
      testCases: { input: unknown; expected: unknown; isHidden: boolean; order: number }[];
    }
  | { errors: ProblemFormState['errors'] } {
  const parsed = problemSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug') ?? '',
    difficulty: formData.get('difficulty'),
    category: formData.get('category'),
    description: formData.get('description'),
    timeLimitMs: formData.get('timeLimitMs') || 3000,
    company: formData.get('company') ?? '',
    examYear: formData.get('examYear') ?? '',
    starterJs: formData.get('starterJs'),
    starterPy: formData.get('starterPy'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }
  const d = parsed.data;

  const tags = parseCsv(formData.get('tags'));
  const keywords = parseCsv(formData.get('keywords'));
  if (keywords.length === 0) {
    return { errors: { form: ['면접 평가 키워드를 1개 이상 입력해 주세요. (쉼표로 구분)'] } };
  }

  // 테스트케이스 — inputs[i], expecteds[i], hiddens[i]('1'|'0') 병렬 배열
  const inputs = formData.getAll('tcInput').map(String);
  const expecteds = formData.getAll('tcExpected').map(String);
  const hiddens = formData.getAll('tcHidden').map(String);
  const testCases: { input: unknown; expected: unknown; isHidden: boolean; order: number }[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const rawIn = inputs[i].trim();
    const rawEx = expecteds[i]?.trim() ?? '';
    if (!rawIn && !rawEx) continue; // 빈 행 무시
    let input: unknown, expected: unknown;
    try {
      input = JSON.parse(rawIn);
    } catch {
      return { errors: { testCases: [`${i + 1}번 테스트케이스의 입력이 올바른 JSON이 아닙니다.`] } };
    }
    if (!Array.isArray(input)) {
      return { errors: { testCases: [`${i + 1}번 테스트케이스의 입력은 인자 배열(JSON array)이어야 합니다. 예: [[2,7,11,15], 9]`] } };
    }
    try {
      expected = JSON.parse(rawEx);
    } catch {
      return { errors: { testCases: [`${i + 1}번 테스트케이스의 기대값이 올바른 JSON이 아닙니다.`] } };
    }
    testCases.push({ input, expected, isHidden: hiddens[i] === '1', order: testCases.length });
  }
  if (testCases.length === 0) {
    return { errors: { testCases: ['테스트케이스를 1개 이상 입력해 주세요.'] } };
  }

  return { data: d, tags, keywords, testCases };
}

function problemData(parsed: Exclude<ReturnType<typeof parseProblemForm>, { errors: ProblemFormState['errors'] }>, slug: string) {
  const d = parsed.data;
  return {
    slug,
    title: d.title,
    difficulty: d.difficulty,
    category: d.category,
    tags: parsed.tags,
    description: d.description,
    timeLimitMs: d.timeLimitMs,
    starterCodes: { javascript: d.starterJs, python: d.starterPy },
    keywords: parsed.keywords,
    company: d.company || null,
    examYear: d.examYear || null,
  };
}

async function requireAdmin(): Promise<ProblemFormState | null> {
  const user = await getUser();
  if (user.role !== 'admin') {
    return { errors: { form: ['관리자만 수행할 수 있습니다.'] } };
  }
  return null;
}

export async function createProblem(_prev: ProblemFormState, formData: FormData): Promise<ProblemFormState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = parseProblemForm(formData);
  if ('errors' in parsed) return { errors: parsed.errors };

  const slug = parsed.data.slug || slugify(parsed.data.title);
  const existing = await prisma.problem.findUnique({ where: { slug }, select: { id: true } });
  if (existing) {
    return { errors: { slug: [`이미 사용 중인 slug입니다: ${slug}`] } };
  }

  const problem = await prisma.problem.create({
    data: {
      ...problemData(parsed, slug),
      testCases: {
        create: parsed.testCases.map((tc) => ({
          input: tc.input as object,
          expected: tc.expected as object,
          isHidden: tc.isHidden,
          order: tc.order,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath('/problems');
  redirect(`/problems/${problem.id}`);
}

// 문제 수정 — 테스트케이스는 제출된 행으로 전체 교체한다
export async function updateProblem(_prev: ProblemFormState, formData: FormData): Promise<ProblemFormState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const problemId = Number(formData.get('problemId'));
  if (!Number.isInteger(problemId)) return { errors: { form: ['잘못된 요청입니다.'] } };

  const parsed = parseProblemForm(formData);
  if ('errors' in parsed) return { errors: parsed.errors };

  const current = await prisma.problem.findUnique({ where: { id: problemId }, select: { slug: true } });
  if (!current) return { errors: { form: ['문제를 찾을 수 없습니다.'] } };

  const slug = parsed.data.slug || current.slug;
  const conflict = await prisma.problem.findFirst({
    where: { slug, NOT: { id: problemId } },
    select: { id: true },
  });
  if (conflict) {
    return { errors: { slug: [`이미 사용 중인 slug입니다: ${slug}`] } };
  }

  await prisma.$transaction([
    prisma.testCase.deleteMany({ where: { problemId } }),
    prisma.problem.update({
      where: { id: problemId },
      data: {
        ...problemData(parsed, slug),
        testCases: {
          create: parsed.testCases.map((tc) => ({
            input: tc.input as object,
            expected: tc.expected as object,
            isHidden: tc.isHidden,
            order: tc.order,
          })),
        },
      },
    }),
  ]);

  revalidatePath('/problems');
  revalidatePath(`/problems/${problemId}`);
  redirect(`/problems/${problemId}`);
}

// 문제 삭제 — 제출 이력이 있으면 채점/면접 기록 보존을 위해 거부
export async function deleteProblem(formData: FormData): Promise<void> {
  const user = await getUser();
  if (user.role !== 'admin') return;

  const problemId = Number(formData.get('problemId'));
  if (!Number.isInteger(problemId)) return;

  const submissionCount = await prisma.submission.count({ where: { problemId } });
  if (submissionCount > 0) {
    redirect(`/dashboard/problems?error=${encodeURIComponent('제출 이력이 있는 문제는 삭제할 수 없습니다.')}`);
  }

  await prisma.$transaction([
    prisma.testCase.deleteMany({ where: { problemId } }),
    prisma.bookmark.deleteMany({ where: { problemId } }),
    prisma.problem.delete({ where: { id: problemId } }),
  ]);

  revalidatePath('/problems');
  revalidatePath('/dashboard/problems');
}
