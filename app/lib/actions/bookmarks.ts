'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '../prisma';
import { verifySession } from '../dal';

export async function createWorkbook(name: string) {
  const { userId } = await verifySession();
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error('문제집 이름을 입력해 주세요.');
  await prisma.workbook.create({ data: { userId, name: clean } });
  revalidatePath('/problems/mine');
}

export async function saveToWorkbook(workbookId: string, problemId: number) {
  const { userId } = await verifySession();
  const workbook = await prisma.workbook.findFirst({ where: { id: workbookId, userId }, select: { id: true } });
  if (!workbook || !Number.isInteger(problemId)) throw new Error('유효하지 않은 문제집입니다.');
  await prisma.workbookItem.upsert({ where: { workbookId_problemId: { workbookId, problemId } }, create: { workbookId, problemId }, update: {} });
  revalidatePath('/problems');
  revalidatePath('/problems/mine');
}

/** 특정 문제집에서 문제를 뺀다 — 이미 담긴 문제집을 다시 눌렀을 때의 해제 동작. */
export async function removeFromWorkbook(workbookId: string, problemId: number) {
  const { userId } = await verifySession();
  if (!Number.isInteger(problemId)) throw new Error('유효하지 않은 문제입니다.');
  await prisma.workbookItem.deleteMany({ where: { workbookId, problemId, workbook: { userId } } });
  revalidatePath('/problems');
  revalidatePath('/problems/mine');
}

export async function removeWorkbookItem(itemId: string) {
  const { userId } = await verifySession();
  await prisma.workbookItem.deleteMany({ where: { id: itemId, workbook: { userId } } });
  revalidatePath('/problems/mine');
}

// 나만의 문제집(스크랩) 토글 — 폼 action으로 직접 바인딩되는 프로그레시브 인핸스먼트 액션.
export async function toggleBookmark(formData: FormData) {
  const { userId } = await verifySession();
  const problemId = Number(formData.get('problemId'));
  if (!problemId) return;

  const existing = await prisma.bookmark.findUnique({
    where: { userId_problemId: { userId, problemId } },
  });

  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
  } else {
    await prisma.bookmark.create({ data: { userId, problemId } });
  }

  revalidatePath('/problems');
  revalidatePath('/problems/mine');
  revalidatePath(`/problems/${problemId}`);
}
