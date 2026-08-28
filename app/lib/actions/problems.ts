'use server';

// 문제 에디터 서버 액션 — 관리자 전용.
// 테스트케이스의 input(인자 배열)/expected(기대 반환값)는 JSON으로 입력받아 저장한다.
import { redirect } from 'next/navigation';
import { LANGUAGE_LABELS, isLanguage, type Language } from '@/app/lib/types';
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
    languages?: string[];
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
  // 지원 언어는 폼에서 고른다 — 고른 언어의 스타터 코드만 필수다.
  starterJs: z.string().trim().max(4000).optional().default(''),
  starterPy: z.string().trim().max(4000).optional().default(''),
});

/** 폼 필드 이름 — 언어를 늘릴 때 여기만 늘리면 된다. */
const STARTER_FIELD: Record<Language, 'starterJs' | 'starterPy'> = {
  javascript: 'starterJs',
  python: 'starterPy',
};

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
      /** 폼에서 고른 지원 언어 — 최소 1개 */
      languages: Language[];
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
    // 고르지 않은 언어의 입력칸은 화면에서 사라지고, 그때 formData.get()은 null을 준다.
    // zod의 .optional()은 undefined만 받으므로 null을 그대로 넘기면 "이유 없이 저장이 안 되는"
    // 상태가 된다 — 화면에 그 언어의 오류를 그릴 자리도 없어서 조용히 막힌다.
    starterJs: formData.get('starterJs') ?? '',
    starterPy: formData.get('starterPy') ?? '',
  });
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    // 에디터가 오류를 그리는 필드는 정해져 있다. 그 밖의 필드에서 막히면 화면에는
    // 아무것도 뜨지 않고 "눌렀는데 아무 일도 안 난다"가 된다 — 폼 맨 위로 끌어올린다.
    const shown = new Set(['title', 'slug', 'difficulty', 'category', 'description', 'starterJs', 'starterPy']);
    const hidden = Object.entries(fieldErrors).filter(([k, v]) => !shown.has(k) && v?.length);
    if (hidden.length > 0) {
      return { errors: { ...fieldErrors, form: hidden.map(([k, v]) => `${k}: ${v[0]}`) } };
    }
    return { errors: fieldErrors };
  }
  const d = parsed.data;

  // 지원 언어 — 하나 이상 골라야 하고, 고른 언어에는 스타터 코드가 있어야 한다.
  const languages = formData.getAll('languages').map(String).filter(isLanguage);
  if (languages.length === 0) {
    return { errors: { languages: ['지원 언어를 1개 이상 선택해 주세요.'] } };
  }
  for (const l of languages) {
    if (!d[STARTER_FIELD[l]].trim()) {
      return { errors: { [STARTER_FIELD[l]]: [`${LANGUAGE_LABELS[l]} 시작 코드를 입력해 주세요.`] } };
    }
  }

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

  return { data: d, languages, tags, keywords, testCases };
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
    // 고르지 않은 언어는 **키 자체를 넣지 않는다** — 빈 문자열을 남기면 목록·에디터가
    // 그 언어를 지원한다고 오해한다(problemLanguages는 빈 값을 거르지만, 저장 단계에서
    // 애초에 만들지 않는 편이 뒤탈이 없다).
    starterCodes: Object.fromEntries(
      parsed.languages.map((l) => [l, d[STARTER_FIELD[l]]]),
    ) as Record<Language, string>,
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
