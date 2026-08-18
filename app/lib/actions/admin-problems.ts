'use server';

// 문제 업로드 액션 — 콘솔에서 문제를 완전한 형태로 등록한다.
//
// 예전 초안 폼은 제목·난이도·카테고리·설명만 받고 "테스트케이스는 검토 과정에서 보완"이라고
// 적혀 있었다. 그런데 검토 화면에도 테스트케이스를 넣을 자리가 없어서, 승인하면 케이스가
// 0개인 문제가 그대로 게시됐다 — 열어도 채점이 되지 않는 문제다.
// 그래서 업로드 시점에 케이스를 필수로 받고, 검토자는 payload를 고쳐서 승인할 수 있게 했다.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { requirePermission } from '../permissions-server';
import { audit } from '../audit';
import {
  bulkImportSchema,
  problemImportSchema,
  formatImportIssues,
  slugifyTitle,
  type ProblemImport,
} from '../problem-import';

export interface ProblemUploadState {
  errors?: string[];
  saved?: string;
  /** 미리보기 결과 — 검증만 하고 저장하지 않은 경우 */
  preview?: { title: string; category: string; difficulty: number; cases: number }[];
}

/** 검증된 문제 하나를 문제 은행에 넣는다. 테스트케이스까지 한 트랜잭션으로. */
async function insertProblem(data: ProblemImport) {
  return prisma.$transaction(async (tx) => {
    const problem = await tx.problem.create({
      data: {
        slug: slugifyTitle(data.title),
        title: data.title,
        difficulty: data.difficulty,
        category: data.category,
        tags: data.tags,
        description: data.description,
        timeLimitMs: data.timeLimitMs,
        starterCodes: data.starterCodes,
        keywords: data.keywords,
        company: data.company || null,
        examYear: data.examYear || null,
      },
    });
    await tx.testCase.createMany({
      data: data.testCases.map((tc, i) => ({
        problemId: problem.id,
        input: tc.input as never,
        expected: tc.expected as never,
        isHidden: tc.isHidden ?? false,
        order: tc.order ?? i,
      })),
    });
    return problem;
  });
}

/* ---------- 단건 등록 ---------- */

/**
 * 폼으로 받은 문제 하나를 바로 게시한다.
 * 검토 권한자가 직접 올리는 경로라 초안 큐를 거치지 않는다 —
 * 자기가 검토할 것을 자기 큐에 넣는 것은 의미가 없다.
 */
export async function createProblem(
  _prev: ProblemUploadState,
  formData: FormData,
): Promise<ProblemUploadState> {
  const caller = await getUser();
  try {
    await requirePermission(caller, 'problem.review');

    // 배열·객체 필드는 화면이 JSON 문자열로 직렬화해 보낸다
    const parseJson = (name: string, fallback: unknown) => {
      const raw = String(formData.get(name) ?? '').trim();
      if (!raw) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`${name} 항목의 JSON 형식이 올바르지 않습니다.`);
      }
    };

    const parsed = problemImportSchema.safeParse({
      title: formData.get('title'),
      difficulty: formData.get('difficulty'),
      category: formData.get('category'),
      description: formData.get('description'),
      tags: String(formData.get('tags') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      timeLimitMs: formData.get('timeLimitMs'),
      starterCodes: {
        javascript: String(formData.get('starterJs') ?? ''),
        python: String(formData.get('starterPy') ?? ''),
      },
      keywords: String(formData.get('keywords') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      company: String(formData.get('company') ?? '') || null,
      examYear: String(formData.get('examYear') ?? '') || null,
      testCases: parseJson('testCases', []),
    });

    if (!parsed.success) return { errors: formatImportIssues(parsed.error) };

    const problem = await insertProblem(parsed.data);
    await audit({
      actor: caller,
      action: 'problem.bulk.import',
      targetType: 'problem',
      targetId: String(problem.id),
      summary: `문제 등록 — ${problem.title} (${parsed.data.category} · 케이스 ${parsed.data.testCases.length}개)`,
    });

    revalidatePath('/problems');
    revalidatePath('/console/problems');
    return { saved: `"${problem.title}"을(를) 문제 은행에 등록했습니다.` };
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : '등록에 실패했습니다.'] };
  }
}

/* ---------- JSON 일괄 등록 ---------- */

/**
 * JSON 배열을 검증하고, `mode=commit`이면 저장한다.
 *
 * 미리보기와 저장을 같은 액션에 둔 이유: 검증 규칙이 갈리면 "미리보기는 통과했는데
 * 저장이 실패하는" 상황이 생긴다. 같은 코드 경로를 두 번 타게 했다.
 */
export async function bulkImportProblems(
  _prev: ProblemUploadState,
  formData: FormData,
): Promise<ProblemUploadState> {
  const caller = await getUser();
  try {
    await requirePermission(caller, 'problem.review');

    const raw = String(formData.get('json') ?? '').trim();
    if (!raw) return { errors: ['JSON을 입력하세요.'] };

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      return { errors: [`JSON 문법 오류: ${error instanceof Error ? error.message : '파싱 실패'}`] };
    }

    const parsed = bulkImportSchema.safeParse(json);
    if (!parsed.success) return { errors: formatImportIssues(parsed.error) };

    const problems = parsed.data;
    const preview = problems.map((p) => ({
      title: p.title,
      category: p.category,
      difficulty: p.difficulty,
      cases: p.testCases.length,
    }));

    if (String(formData.get('mode') ?? '') !== 'commit') {
      return { preview };
    }

    // 한 건씩 넣는다. 20건 중 3건이 실패했을 때 나머지 17건까지 되돌리면
    // 어디까지 됐는지 다시 세어야 한다 — 부분 성공을 그대로 보고하는 편이 낫다.
    const created: string[] = [];
    const failed: string[] = [];
    for (const p of problems) {
      try {
        const problem = await insertProblem(p);
        created.push(problem.title);
      } catch (error) {
        failed.push(`${p.title}: ${error instanceof Error ? error.message.slice(0, 80) : '저장 실패'}`);
      }
    }

    await audit({
      actor: caller,
      action: 'problem.bulk.import',
      targetType: 'problem',
      summary: `문제 일괄 등록 ${created.length}건 성공${failed.length ? ` · ${failed.length}건 실패` : ''}`,
      diff: { after: { created, failed } },
    });

    revalidatePath('/problems');
    revalidatePath('/console/problems');
    return {
      saved: `${created.length}건을 등록했습니다.${failed.length ? ` (${failed.length}건 실패)` : ''}`,
      errors: failed.length ? failed : undefined,
      preview,
    };
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : '일괄 등록에 실패했습니다.'] };
  }
}

/* ---------- 검토큐: 수정 후 승인 ---------- */

const draftEditSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(2).max(120),
  difficulty: z.coerce.number().int().min(1).max(4),
  category: z.string().trim().min(1),
  description: z.string().trim().min(10).max(20000),
  payload: z.string(),
});

/**
 * 초안을 고쳐서 저장한다 — 승인 전에 검토자가 다듬는 경로.
 *
 * 예전에는 승인/반려 두 가지뿐이라, 테스트케이스 하나만 틀려도 반려하고
 * 출제자에게 다시 올려 달라고 해야 했다. 왕복이 길어져 큐가 밀렸다.
 */
export async function editProblemDraft(
  _prev: ProblemUploadState,
  formData: FormData,
): Promise<ProblemUploadState> {
  const caller = await getUser();
  try {
    await requirePermission(caller, 'problem.review');

    const parsed = draftEditSchema.safeParse({
      id: formData.get('id'),
      title: formData.get('title'),
      difficulty: formData.get('difficulty'),
      category: formData.get('category'),
      description: formData.get('description'),
      payload: formData.get('payload'),
    });
    if (!parsed.success) return { errors: formatImportIssues(parsed.error) };

    let payload: unknown;
    try {
      payload = JSON.parse(parsed.data.payload || '{}');
    } catch {
      return { errors: ['payload JSON 형식이 올바르지 않습니다.'] };
    }

    await prisma.problemDraft.update({
      where: { id: parsed.data.id },
      data: {
        title: parsed.data.title,
        difficulty: parsed.data.difficulty,
        category: parsed.data.category,
        description: parsed.data.description,
        payload: payload as never,
      },
    });

    await audit({
      actor: caller,
      action: 'problem.draft.edit',
      targetType: 'problemDraft',
      targetId: parsed.data.id,
      summary: `초안 수정 — ${parsed.data.title}`,
    });

    revalidatePath('/console/problem-review');
    return { saved: '초안을 수정했습니다. 이제 승인하면 이 내용으로 게시됩니다.' };
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : '수정에 실패했습니다.'] };
  }
}

/* ---------- 문제 은행: 수정 / 삭제 ---------- */

/**
 * 게시된 문제를 고친다 — 지문·난이도·태그·테스트케이스까지.
 *
 * 테스트케이스는 통째로 갈아끼운다(삭제 후 재삽입). 부분 갱신으로 만들면 "화면에서 지운 케이스가
 * DB에는 남아 있는" 어긋남이 생기는데, 채점에서 그 차이는 곧바로 오답 판정으로 나타난다.
 */
export async function updateProblem(
  _prev: ProblemUploadState,
  formData: FormData,
): Promise<ProblemUploadState> {
  const caller = await getUser();
  try {
    await requirePermission(caller, 'problem.manage');

    const id = Number(formData.get('id'));
    if (!Number.isInteger(id)) return { errors: ['문제를 찾을 수 없습니다.'] };

    let testCases: unknown;
    try {
      testCases = JSON.parse(String(formData.get('testCases') ?? '[]'));
    } catch {
      return { errors: ['테스트케이스 JSON 형식이 올바르지 않습니다.'] };
    }

    const parsed = problemImportSchema.safeParse({
      title: formData.get('title'),
      difficulty: formData.get('difficulty'),
      category: formData.get('category'),
      description: formData.get('description'),
      tags: String(formData.get('tags') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      timeLimitMs: formData.get('timeLimitMs'),
      starterCodes: {
        javascript: String(formData.get('starterJs') ?? ''),
        python: String(formData.get('starterPy') ?? ''),
      },
      keywords: String(formData.get('keywords') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      company: String(formData.get('company') ?? '') || null,
      examYear: String(formData.get('examYear') ?? '') || null,
      testCases,
    });
    if (!parsed.success) return { errors: formatImportIssues(parsed.error) };

    const before = await prisma.problem.findUnique({
      where: { id },
      select: { title: true, difficulty: true, category: true },
    });
    if (!before) return { errors: ['문제를 찾을 수 없습니다.'] };

    const d = parsed.data;
    await prisma.$transaction(async (tx) => {
      await tx.problem.update({
        where: { id },
        data: {
          title: d.title,
          difficulty: d.difficulty,
          category: d.category,
          tags: d.tags,
          description: d.description,
          timeLimitMs: d.timeLimitMs,
          starterCodes: d.starterCodes,
          keywords: d.keywords,
          company: d.company || null,
          examYear: d.examYear || null,
        },
      });
      await tx.testCase.deleteMany({ where: { problemId: id } });
      await tx.testCase.createMany({
        data: d.testCases.map((tc, i) => ({
          problemId: id,
          input: tc.input as never,
          expected: tc.expected as never,
          isHidden: tc.isHidden ?? false,
          order: tc.order ?? i,
        })),
      });
    });

    await audit({
      actor: caller,
      action: 'problem.update',
      targetType: 'problem',
      targetId: String(id),
      summary: `문제 수정 — ${d.title} (케이스 ${d.testCases.length}개)`,
      diff: { before, after: { title: d.title, difficulty: d.difficulty, category: d.category } },
    });

    revalidatePath('/problems');
    revalidatePath(`/problems/${id}`);
    revalidatePath('/console/problems');
    return { saved: `"${d.title}"을(를) 수정했습니다.` };
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : '수정에 실패했습니다.'] };
  }
}

/**
 * 문제 삭제.
 *
 * 제출·면접 기록이 이 문제를 참조하고 있으면 지우지 않는다. 지워 버리면 이용자의 풀이 이력이
 * 함께 사라지고, 랭킹 점수의 근거도 없어진다. 그런 문제는 삭제가 아니라 비공개가 맞다.
 */
export async function deleteProblem(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'problem.manage');

  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;

  const target = await prisma.problem.findUnique({
    where: { id },
    select: {
      title: true,
      _count: { select: { submissions: true, runAttempts: true, debateQSessions: true, setItems: true } },
    },
  });
  if (!target) return;

  const used =
    target._count.submissions + target._count.runAttempts + target._count.debateQSessions;
  if (used > 0) {
    throw new Error(
      `풀이 기록이 ${used}건 남아 있어 삭제할 수 없습니다. 이용자 이력이 함께 사라집니다 — 대신 문제집 세트에서 빼거나 지문에 안내를 남기세요.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.testCase.deleteMany({ where: { problemId: id } });
    await tx.bookmark.deleteMany({ where: { problemId: id } });
    await tx.workbookItem.deleteMany({ where: { problemId: id } });
    await tx.problemSetItem.deleteMany({ where: { problemId: id } });
    await tx.debateAiChat.deleteMany({ where: { problemId: id } });
    await tx.problem.delete({ where: { id } });
  });

  await audit({
    actor: caller,
    action: 'problem.delete',
    targetType: 'problem',
    targetId: String(id),
    summary: `문제 삭제 — ${target.title}`,
  });

  revalidatePath('/problems');
  revalidatePath('/console/problems');
}
