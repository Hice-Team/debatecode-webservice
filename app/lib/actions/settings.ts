'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../prisma';
import { verifySession } from '../dal';
import { AI_PROVIDERS, DEFAULT_BASE_URLS, LOCKED_PROVIDERS, isSelectableProvider } from '../ai/config';
import { getProviderFor } from '../ai/provider';
import { LlmInterviewer } from '../ai/llm-interviewer';
import { decryptSecret, encryptSecret } from '../crypto';

export interface AiSettingsState {
  errors?: { form?: string[] };
  saved?: boolean;
}

export interface AiTestState {
  ok?: boolean;
  message?: string;
}

// SSRF 방지 — 루프백/링크로컬/사설 대역 호스트 차단
function isPrivateHost(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
    if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (host === '[::1]' || host.startsWith('[fc') || host.startsWith('[fd') || host.startsWith('[fe80')) return true;
    return false;
  } catch {
    return true;
  }
}

const PROVIDER_KEYS = AI_PROVIDERS.map((p) => p.key) as [string, ...string[]];
const KEY_REQUIRED = new Set<string>(AI_PROVIDERS.filter((p) => p.needsKey).map((p) => p.key));
const URL_REQUIRED = new Set<string>(AI_PROVIDERS.filter((p) => p.needsUrl).map((p) => p.key));

const settingsSchema = z
  .object({
    aiProvider: z.enum(PROVIDER_KEYS),
    aiModel: z.string().max(100).optional().or(z.literal('')),
    aiApiKey: z.string().max(300).optional().or(z.literal('')),
    aiBaseUrl: z
      .url('올바른 URL 형식이 아닙니다.')
      .max(300)
      // 서버가 이 URL로 요청을 보내므로(SSRF 방지) https + 공인 호스트만 허용
      .refine((v) => /^https:\/\//i.test(v), 'https URL만 사용할 수 있습니다.')
      .refine((v) => !isPrivateHost(v), '내부 네트워크 주소는 사용할 수 없습니다.')
      .optional()
      .or(z.literal('')),
  })
  // 키 필수 여부는 저장 단계에서 "기존 키가 있는가"까지 보고 판단한다(아래 saveAiSettings)

  .refine((d) => (URL_REQUIRED.has(d.aiProvider) ? !!(d.aiBaseUrl || DEFAULT_BASE_URLS[d.aiProvider]) : true), {
    message: '로컬/브릿지 연동에는 엔드포인트 URL이 필요합니다.',
  });

export async function saveAiSettings(
  _prev: AiSettingsState,
  formData: FormData,
): Promise<AiSettingsState> {
  const session = await verifySession();

  const parsed = settingsSchema.safeParse({
    aiProvider: formData.get('aiProvider'),
    aiModel: formData.get('aiModel'),
    aiApiKey: formData.get('aiApiKey'),
    aiBaseUrl: formData.get('aiBaseUrl'),
  });
  if (!parsed.success) {
    return { errors: { form: parsed.error.issues.map((i) => i.message) } };
  }

  const { aiProvider, aiModel, aiApiKey, aiBaseUrl } = parsed.data;
  if (LOCKED_PROVIDERS.has(aiProvider) || !isSelectableProvider(aiProvider)) {
    return { errors: { form: ['이 프로바이더는 아직 지원 준비 중입니다. (추후 지원 예정)'] } };
  }

  // 키 입력칸이 비어 있으면 "지우기"가 아니라 "그대로 두기"다 — 화면에는 기존 키가 내려오지
  // 않으므로, 다른 설정만 바꿔 저장할 때마다 키가 날아가면 안 된다.
  const existing = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { aiApiKey: true },
  });
  const keyToStore = aiApiKey ? await encryptSecret(aiApiKey) : (existing?.aiApiKey ?? null);
  if (KEY_REQUIRED.has(aiProvider) && !keyToStore) {
    return { errors: { form: ['선택한 프로바이더에는 API 키가 필요합니다.'] } };
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      aiProvider,
      aiModel: aiModel || null,
      aiApiKey: keyToStore,
      aiBaseUrl: await encryptSecret(aiBaseUrl || DEFAULT_BASE_URLS[aiProvider] || null),
      aiOnboarded: true,
    },
  });

  // 오픈 리다이렉트 방지 — 서비스 내부 경로만 허용
  const redirectTo = formData.get('redirectTo');
  if (typeof redirectTo === 'string' && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
    redirect(redirectTo);
  }

  return { saved: true };
}

// 설정 화면 "연결 테스트" — 저장 없이 현재 폼 값으로 1회 왕복 핑
export async function testAiConnection(_prev: AiTestState, formData: FormData): Promise<AiTestState> {
  const session = await verifySession();

  const aiProvider = String(formData.get('aiProvider') ?? 'mock');
  if (aiProvider === 'mock') {
    return { ok: true, message: '내장 면접관은 항상 사용 가능합니다.' };
  }
  if (LOCKED_PROVIDERS.has(aiProvider)) {
    return { ok: false, message: '이 프로바이더는 아직 지원 준비 중입니다.' };
  }

  // 저장 경로와 동일한 SSRF 가드 — 테스트 호출도 서버에서 나가는 요청이다
  const rawBaseUrl = String(formData.get('aiBaseUrl') ?? '');
  if (rawBaseUrl && (!/^https:\/\//i.test(rawBaseUrl) || isPrivateHost(rawBaseUrl))) {
    return { ok: false, message: '엔드포인트는 공인 https URL만 사용할 수 있습니다.' };
  }

  const typedKey = String(formData.get('aiApiKey') ?? '');
  const storedKey = typedKey
    ? null
    : await prisma.user
        .findUnique({ where: { id: session.userId }, select: { aiApiKey: true } })
        .then((u) => decryptSecret(u?.aiApiKey));

  const provider = getProviderFor({
    aiProvider,
    aiModel: String(formData.get('aiModel') ?? '') || null,
    aiApiKey: typedKey || storedKey || null,
    aiBaseUrl: rawBaseUrl || DEFAULT_BASE_URLS[aiProvider] || null,
  });

  if (!(provider instanceof LlmInterviewer)) {
    return { ok: false, message: '설정이 불완전합니다. API 키를 확인해 주세요.' };
  }

  try {
    await provider.ping();
    return { ok: true, message: '연결 성공! 이 설정으로 면접을 진행할 수 있습니다.' };
  } catch (e) {
    return { ok: false, message: `연결 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}` };
  }
}

// 로그인된 기기(세션) 원격 로그아웃 — auth.sessions에서 본인 소유 세션만 삭제한다.
// 세션 행이 사라지면 해당 기기의 리프레시 토큰이 무효화되어 로그아웃된다.
export async function signOutDevice(formData: FormData) {
  const session = await verifySession();
  const sessionId = String(formData.get('sessionId') ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return;
  await prisma
    .$executeRaw`DELETE FROM auth.sessions WHERE id = ${sessionId}::uuid AND user_id = ${session.userId}::uuid`
    .catch(() => {});
  revalidatePath('/settings');
}

/** 선택한 종류의 서비스 이용 데이터를 삭제한다. */
export async function deleteSelectedUserData(formData: FormData) {
  const session = await verifySession();
  const types = formData.getAll('types').map((v) => String(v));

  await prisma.$transaction(async (tx) => {
    if (types.includes('activityLogs')) {
      await tx.runAttempt.deleteMany({ where: { userId: session.userId } });
    }
    if (types.includes('submissions')) {
      await tx.submission.deleteMany({ where: { userId: session.userId } });
    }
    if (types.includes('posts')) {
      await tx.post.deleteMany({ where: { authorId: session.userId } });
    }
    if (types.includes('comments')) {
      await tx.comment.deleteMany({ where: { authorId: session.userId } });
    }
    if (types.includes('aiSessions')) {
      await tx.aiSession.deleteMany({ where: { userId: session.userId } });
    }
    if (types.includes('debateChats')) {
      await tx.debateAiChat.deleteMany({ where: { userId: session.userId } });
    }
    if (types.includes('bookmarks')) {
      await tx.bookmark.deleteMany({ where: { userId: session.userId } });
    }
  });

  // 캐시/클라이언트 데이터: 서버쪽은 경로 재검증으로 반영
  revalidatePath('/settings');
  revalidatePath('/study');
  revalidatePath('/study/search');
}

export async function skipAiOnboarding() {
  const session = await verifySession();
  await prisma.user.update({ where: { id: session.userId }, data: { aiOnboarded: true } });
  redirect('/dashboard');
}

export async function saveRecoveryEmail(formData: FormData) {
  const session = await verifySession();
  const email = String(formData.get('recoveryEmail') ?? '').trim();
  if (!email) return;
  await prisma.user.update({ where: { id: session.userId }, data: { twoFactorRecoveryEmail: email } });
  revalidatePath('/settings');
}
