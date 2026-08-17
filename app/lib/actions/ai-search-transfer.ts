'use server';

// AI Search 세션 가져오기 — 내보낸 JSON을 검증해 새 세션으로 복원한다.
// 내보내기는 클라이언트에서 파일로 저장하므로 서버 액션이 필요 없다(composer.tsx).
//
// 가져온 세션은 항상 새 session id로 저장한다 — 현재 대화와 섞이지 않게 하기 위해서다.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { verifySession } from '../dal';
import { prisma } from '../prisma';

export interface ImportState {
  errors?: { form?: string[] };
  sessionId?: string;
}

/** 내보내기 형식 — format/version을 확인해 다른 파일을 걸러낸다. */
const sessionFileSchema = z.object({
  format: z.literal('debatecode-ai-session'),
  version: z.number().int().min(1).max(1),
  createdAt: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(20_000),
        createdAt: z.string().optional(),
      }),
    )
    .min(1, '메시지가 없는 세션 파일입니다.')
    .max(500, '메시지가 너무 많습니다. (최대 500개)'),
});

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function importSessionFile(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { userId } = await verifySession();

  const fileName = String(formData.get('fileName') ?? 'session.json').slice(0, 200);
  const raw = String(formData.get('payload') ?? '');
  if (!raw) return { errors: { form: ['빈 파일입니다.'] } };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { errors: { form: [`"${fileName}"은(는) 올바른 JSON이 아닙니다.`] } };
  }

  const parsed = sessionFileSchema.safeParse(json);
  if (!parsed.success) {
    const first = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0];
    return { errors: { form: [first ?? `"${fileName}"은(는) 지원하지 않는 세션 파일 형식입니다.`] } };
  }

  const { messages } = parsed.data;
  const base = parseDate(parsed.data.createdAt, new Date());

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.aiSession.create({
      data: {
        userId,
        title: messages.find((m) => m.role === 'user')?.content.slice(0, 40) ?? fileName,
        importedFrom: { fileName, messageCount: messages.length, importedAt: new Date().toISOString() },
      },
    });

    await tx.aiMessage.createMany({
      data: messages.map((message, index) => ({
        sessionId: created.id,
        role: message.role,
        content: message.content,
        // 원본 시각이 없거나 깨졌으면 순서를 유지하도록 1초씩 벌려 둔다
        createdAt: parseDate(message.createdAt, new Date(base.getTime() + index * 1000)),
      })),
    });

    return created;
  });

  revalidatePath('/study');
  revalidatePath('/study/search');
  return { sessionId: session.id };
}


/** 내 AI Search 대화를 전부 삭제한다 — 설정의 데이터 정리에서 호출한다. */
export async function deleteAllAiSessions(): Promise<void> {
  const { userId } = await verifySession();
  await prisma.aiSession.deleteMany({ where: { userId } });
  revalidatePath('/settings');
  revalidatePath('/study');
  revalidatePath('/study/search');
}
