// 문제집 세트 초기 편성 — 기존 기출 문제(company/examYear)를 기업·연도별 세트로 묶고,
// 난이도별 실전 모의고사와 카테고리 테마 세트를 만든다. 같은 slug가 있으면 건너뛴다.
// 실행: npx tsx prisma/seed-problem-sets.ts
import { PrismaClient } from '../app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function slugify(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || [...value].map((ch) => ch.codePointAt(0)!.toString(36)).join('');
}

async function createSet(data: {
  slug: string;
  title: string;
  kind: string;
  description: string;
  company?: string | null;
  examYear?: string | null;
  difficulty: number;
  timeLimitMin: number | null;
  order: number;
  problemIds: number[];
}) {
  if (data.problemIds.length === 0) return false;
  const existing = await prisma.problemSet.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (existing) return false;

  await prisma.problemSet.create({
    data: {
      slug: data.slug,
      title: data.title,
      kind: data.kind,
      description: data.description,
      company: data.company ?? null,
      examYear: data.examYear ?? null,
      difficulty: data.difficulty,
      timeLimitMin: data.timeLimitMin,
      published: true,
      order: data.order,
      items: { create: data.problemIds.map((problemId, i) => ({ problemId, order: i })) },
    },
  });
  return true;
}

async function main() {
  const problems = await prisma.problem.findMany({
    orderBy: [{ difficulty: 'asc' }, { id: 'asc' }],
    select: { id: true, title: true, difficulty: true, category: true, company: true, examYear: true },
  });
  if (problems.length === 0) {
    console.log('문제가 없습니다. prisma/seed.ts를 먼저 실행하세요.');
    return;
  }

  let order = 0;
  let created = 0;

  // 1) 기출 모음집 — 기업 × 연도
  const examGroups = new Map<string, typeof problems>();
  for (const p of problems) {
    if (!p.company) continue;
    const key = `${p.company}__${p.examYear ?? 'all'}`;
    examGroups.set(key, [...(examGroups.get(key) ?? []), p]);
  }
  for (const [key, list] of examGroups) {
    const [company, year] = key.split('__');
    const avg = Math.round(list.reduce((sum, p) => sum + p.difficulty, 0) / list.length);
    const made = await createSet({
      slug: `exam-${slugify(company)}-${year}`,
      title: year === 'all' ? `${company} 기출 모음집` : `${company} ${year} 기출 모음집`,
      kind: 'exam',
      description: `${company}의 기출 유형 ${list.length}문제를 한 세트로 묶었습니다. 순서대로 풀고 AI 면접관 앞에서 방어해 보세요.`,
      company,
      examYear: year === 'all' ? null : year,
      difficulty: Math.min(4, Math.max(1, avg)),
      timeLimitMin: list.length * 30,
      order: order++,
      problemIds: list.map((p) => p.id),
    });
    if (made) created += 1;
  }

  // 2) 실전 모의고사 — 난이도 스펙트럼을 섞은 3회분
  const byDifficulty = (d: number) => problems.filter((p) => p.difficulty === d);
  const mockPlans = [
    { n: 1, label: '입문', pick: [1, 1, 2, 2], minutes: 90 },
    { n: 2, label: '중급', pick: [2, 2, 3, 3], minutes: 120 },
    { n: 3, label: '고급', pick: [3, 3, 4, 4], minutes: 150 },
  ];
  for (const plan of mockPlans) {
    const used = new Set<number>();
    const picked: number[] = [];
    for (const d of plan.pick) {
      const candidate = byDifficulty(d).find((p) => !used.has(p.id)) ?? problems.find((p) => !used.has(p.id));
      if (candidate) {
        used.add(candidate.id);
        picked.push(candidate.id);
      }
    }
    const made = await createSet({
      slug: `mock-vol-${plan.n}`,
      title: `실전 모의고사 Vol.${plan.n} — ${plan.label}`,
      kind: 'mock',
      description: `${plan.label} 난이도 ${picked.length}문제를 ${plan.minutes}분 안에. 실제 코딩테스트처럼 시간을 재고 풀어 보세요.`,
      difficulty: Math.max(...plan.pick),
      timeLimitMin: plan.minutes,
      order: 100 + plan.n,
      problemIds: picked,
    });
    if (made) created += 1;
  }

  // 3) 테마 문제집 — 카테고리별
  const categories = new Map<string, typeof problems>();
  for (const p of problems) {
    categories.set(p.category, [...(categories.get(p.category) ?? []), p]);
  }
  let themeOrder = 200;
  for (const [category, list] of categories) {
    if (list.length < 2) continue;
    const avg = Math.round(list.reduce((sum, p) => sum + p.difficulty, 0) / list.length);
    const made = await createSet({
      slug: `theme-${slugify(category)}`,
      title: `${category} 집중 공략`,
      kind: 'theme',
      description: `${category} 유형 ${list.length}문제를 난이도 순으로 모았습니다. 한 유형을 끝까지 파고들 때 좋습니다.`,
      difficulty: Math.min(4, Math.max(1, avg)),
      timeLimitMin: null,
      order: themeOrder++,
      problemIds: list.map((p) => p.id),
    });
    if (made) created += 1;
  }

  const total = await prisma.problemSet.count();
  console.log(`새로 만든 세트: ${created}개 / 전체 세트: ${total}개`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
