'use server';

// 코딩테스트 문제집 세트 — 운영 콘솔에서 편성/공개하고 /contests 라이브러리에 노출한다.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { canManagePublishedContent } from '../roles';
import { SET_KINDS } from '../problem-sets';

// 문제집 세트는 /contests에 그대로 노출되는 공개 자산이다.
// 콘솔 접근 권한이 아니라 '공개 콘텐츠 편성' 권한으로 좁혀 검사한다(최소 권한).
async function requireContentManager() {
  const caller = await getUser();
  if (!canManagePublishedContent(caller.role)) throw new Error('문제집 세트를 관리할 권한이 없습니다.');
  return caller;
}

export interface ProblemSetState {
  errors?: { form?: string[] };
  saved?: boolean;
}

const setSchema = z.object({
  title: z.string().trim().min(2, '제목을 2자 이상 입력해 주세요.').max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'slug는 소문자·숫자·하이픈만 사용할 수 있습니다.'),
  kind: z.enum(SET_KINDS),
  description: z.string().trim().min(2, '설명을 입력해 주세요.').max(1000),
  company: z.string().trim().max(60).optional().or(z.literal('')),
  examYear: z.string().trim().max(10).optional().or(z.literal('')),
  difficulty: z.coerce.number().int().min(1).max(4),
  timeLimitMin: z.coerce.number().int().min(0).max(600).optional(),
  order: z.coerce.number().int().min(0).max(9999),
  published: z.boolean(),
});

function parseSetForm(formData: FormData) {
  return setSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug'),
    kind: formData.get('kind'),
    description: formData.get('description'),
    company: formData.get('company') ?? '',
    examYear: formData.get('examYear') ?? '',
    difficulty: formData.get('difficulty') ?? 2,
    timeLimitMin: formData.get('timeLimitMin') || 0,
    order: formData.get('order') ?? 0,
    published: formData.get('published') === 'on',
  });
}

function toData(parsed: z.infer<typeof setSchema>) {
  return {
    title: parsed.title,
    slug: parsed.slug,
    kind: parsed.kind,
    description: parsed.description,
    company: parsed.company || null,
    examYear: parsed.examYear || null,
    difficulty: parsed.difficulty,
    timeLimitMin: parsed.timeLimitMin ? parsed.timeLimitMin : null,
    order: parsed.order,
    published: parsed.published,
  };
}

function revalidateSets(slug?: string) {
  revalidatePath('/contests');
  revalidatePath('/console/problem-sets');
  if (slug) revalidatePath(`/contests/${slug}`);
}

export async function createProblemSet(_prev: ProblemSetState, formData: FormData): Promise<ProblemSetState> {
  await requireContentManager();
  const parsed = parseSetForm(formData);
  if (!parsed.success) return { errors: { form: z.flattenError(parsed.error).formErrors.concat(Object.values(z.flattenError(parsed.error).fieldErrors).flat()) } };

  const exists = await prisma.problemSet.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
  if (exists) return { errors: { form: ['이미 같은 slug의 세트가 있습니다.'] } };

  await prisma.problemSet.create({ data: toData(parsed.data) });
  revalidateSets(parsed.data.slug);
  return { saved: true };
}

export async function updateProblemSet(_prev: ProblemSetState, formData: FormData): Promise<ProblemSetState> {
  await requireContentManager();
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return { errors: { form: ['잘못된 세트입니다.'] } };

  const parsed = parseSetForm(formData);
  if (!parsed.success) return { errors: { form: z.flattenError(parsed.error).formErrors.concat(Object.values(z.flattenError(parsed.error).fieldErrors).flat()) } };

  const clash = await prisma.problemSet.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } });
  if (clash && clash.id !== id) return { errors: { form: ['이미 같은 slug의 세트가 있습니다.'] } };

  await prisma.problemSet.update({ where: { id }, data: toData(parsed.data) });
  revalidateSets(parsed.data.slug);
  return { saved: true };
}

export async function deleteProblemSet(formData: FormData) {
  await requireContentManager();
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  await prisma.problemSet.delete({ where: { id } });
  revalidateSets();
}

export async function toggleProblemSetPublished(formData: FormData) {
  await requireContentManager();
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  const set = await prisma.problemSet.findUnique({ where: { id }, select: { published: true, slug: true } });
  if (!set) return;
  await prisma.problemSet.update({ where: { id }, data: { published: !set.published } });
  revalidateSets(set.slug);
}

/** 세트에 문제 추가 — 맨 뒤에 붙인다. 이미 있으면 조용히 무시. */
export async function addProblemToSet(formData: FormData) {
  await requireContentManager();
  const setId = Number(formData.get('setId'));
  const problemId = Number(formData.get('problemId'));
  if (!Number.isInteger(setId) || !Number.isInteger(problemId)) return;

  const last = await prisma.problemSetItem.findFirst({ where: { setId }, orderBy: { order: 'desc' }, select: { order: true } });
  await prisma.problemSetItem.upsert({
    where: { setId_problemId: { setId, problemId } },
    create: { setId, problemId, order: (last?.order ?? -1) + 1 },
    update: {},
  });
  revalidateSets();
}

export async function removeProblemFromSet(formData: FormData) {
  await requireContentManager();
  const itemId = String(formData.get('itemId') ?? '');
  if (!itemId) return;
  await prisma.problemSetItem.delete({ where: { id: itemId } });
  revalidateSets();
}

/** 세트 안에서 문제 순서를 한 칸 위/아래로 옮긴다. */
export async function moveProblemInSet(formData: FormData) {
  await requireContentManager();
  const itemId = String(formData.get('itemId') ?? '');
  const direction = String(formData.get('direction') ?? '');
  if (!itemId || (direction !== 'up' && direction !== 'down')) return;

  const item = await prisma.problemSetItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  const neighbor = await prisma.problemSetItem.findFirst({
    where:
      direction === 'up'
        ? { setId: item.setId, order: { lt: item.order } }
        : { setId: item.setId, order: { gt: item.order } },
    orderBy: { order: direction === 'up' ? 'desc' : 'asc' },
  });
  if (!neighbor) return;

  await prisma.$transaction([
    prisma.problemSetItem.update({ where: { id: item.id }, data: { order: neighbor.order } }),
    prisma.problemSetItem.update({ where: { id: neighbor.id }, data: { order: item.order } }),
  ]);
  revalidateSets();
}

/**
 * 기존 기출 문제(Problem.company + examYear)를 기업·연도별 세트로 자동 편성한다.
 * 이미 같은 slug의 세트가 있으면 건너뛰므로 여러 번 눌러도 안전하다.
 */
export async function autoBuildExamSets() {
  await requireContentManager();

  const problems = await prisma.problem.findMany({
    where: { company: { not: null } },
    orderBy: [{ company: 'asc' }, { difficulty: 'asc' }, { id: 'asc' }],
    select: { id: true, company: true, examYear: true, difficulty: true },
  });

  // (company, year) 조합으로 묶는다
  const groups = new Map<string, typeof problems>();
  for (const p of problems) {
    const key = `${p.company}__${p.examYear ?? 'all'}`;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  let created = 0;
  let index = 0;
  for (const [key, list] of groups) {
    const [company, year] = key.split('__');
    const slug = `exam-${slugify(company)}-${year}`;
    const existing = await prisma.problemSet.findUnique({ where: { slug }, select: { id: true } });
    if (existing) continue;

    const avgDifficulty = Math.round(list.reduce((sum, p) => sum + p.difficulty, 0) / list.length);
    await prisma.problemSet.create({
      data: {
        slug,
        title: year === 'all' ? `${company} 기출 모음집` : `${company} ${year} 기출 모음집`,
        kind: 'exam',
        description: `${company}의 기출 유형 ${list.length}문제를 한 세트로 묶었습니다. 순서대로 풀고 AI 면접관 앞에서 방어해 보세요.`,
        company,
        examYear: year === 'all' ? null : year,
        difficulty: Math.min(4, Math.max(1, avgDifficulty)),
        timeLimitMin: list.length * 30,
        published: true,
        order: index++,
        items: { create: list.map((p, i) => ({ problemId: p.id, order: i })) },
      },
    });
    created += 1;
  }

  revalidateSets();
  return created;
}

/** 한글 기업명도 안전한 slug 조각으로 — 영숫자 외 문자는 코드포인트로 치환한다. */
function slugify(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii) return ascii;
  return [...value].map((ch) => ch.codePointAt(0)!.toString(36)).join('');
}
