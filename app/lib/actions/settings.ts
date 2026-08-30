'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../prisma';
import { verifySession } from '../dal';
import { createClient } from '../supabase/server';
import { AI_PROVIDERS, DEFAULT_BASE_URLS, LOCKED_PROVIDERS, isSelectableProvider } from '../ai/config';
import { getProviderFor } from '../ai/provider';
import { LlmInterviewer } from '../ai/llm-interviewer';
import { decryptSecret, encryptSecret } from '../crypto';
import { isDebateAiModelId } from '../ai/debateai-models';
import { isSearchModelId } from '../ai/search-models';
import { MAX_INSTRUCTIONS, MAX_INSTRUCTION_LENGTH, isContextMode } from '../user-prefs';

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
      // 이 폼이 aiModel을 보내지 않을 때는 건드리지 않는다 — 모델은 debateAI 탭·AI Search의
      // 셀렉터에서 고르므로, 여기서 null로 덮으면 저장할 때마다 그 선택이 초기화된다.
      ...(formData.has('aiModel') ? { aiModel: aiModel || null } : {}),
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

export interface DeleteDataState {
  /** 한 번이라도 실행했는지 — 결과 문구를 언제 띄울지 판단한다 */
  sent?: boolean;
  error?: string;
}

/**
 * 선택한 종류의 서비스 이용 데이터를 삭제한다.
 *
 * useActionState가 부르므로 시그니처는 반드시 (이전 상태, FormData)여야 한다.
 * 예전에는 FormData 하나만 받도록 되어 있어서 첫 인자로 상태 객체가 들어갔고,
 * formData.getAll이 그 객체에서 호출되며 삭제가 통째로 실패했다.
 */
export async function deleteSelectedUserData(
  _prev: DeleteDataState,
  formData: FormData,
): Promise<DeleteDataState> {
  const session = await verifySession();
  const types = formData.getAll('types').map((v) => String(v));
  if (types.length === 0) return { sent: true, error: '삭제할 항목을 선택해 주세요.' };

  try {
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
  } catch (error) {
    return { sent: true, error: error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.' };
  }

  // 캐시/클라이언트 데이터: 서버쪽은 경로 재검증으로 반영
  revalidatePath('/settings');
  revalidatePath('/study');
  revalidatePath('/study/search');
  return { sent: true };
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

/**
 * 학습 활용 동의 켜고 끄기.
 *
 * 선택 동의라서 언제든 되돌릴 수 있어야 한다(개인정보보호법 제37조·GDPR 7(3)).
 * 시각을 지우는 것으로 철회를 표시한다 — 켠 적이 있는지와 지금 켜져 있는지를
 * 한 컬럼으로 다루기 위해서다.
 */
export async function setAiTrainingConsent(formData: FormData): Promise<void> {
  const session = await verifySession();
  const on = String(formData.get('consent') ?? '') === 'on';
  await prisma.user.update({
    where: { id: session.userId },
    data: { aiTrainingConsentAt: on ? new Date() : null },
  });
  revalidatePath('/settings');
}

/**
 * 이 기기를 뺀 모든 기기에서 로그아웃.
 *
 * 계정을 빼앗겼을 때 가장 먼저 눌러야 하는 버튼이다. 기기 목록에서 하나씩 끊게만 두면
 * 목록에 안 잡히는 세션(만료 직전이라 조회에서 빠진 것)이 남는다.
 * scope 'others'를 쓰는 이유는, 지금 보고 있는 화면까지 끊기면 그다음에 해야 할
 * 비밀번호 변경으로 이어 가지 못하기 때문이다.
 */
export async function signOutOtherDevices(): Promise<void> {
  await verifySession();
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'others' }).catch(() => {});
  revalidatePath('/settings');
}

/**
 * AI 개인 설정 — 기본 모델 2종, 개별 지침, 맥락 양.
 *
 * 지침을 배열로 받는다. 텍스트 한 덩어리가 아니라 목록이라, 한 줄을 빼도
 * 나머지를 다시 쓸 일이 없다. 저장 전에 길이와 개수를 다시 자른다 —
 * 화면에서 막았다고 해서 서버가 믿을 이유는 없다.
 */
export async function saveAiPersonalization(
  _prev: AiSettingsState,
  formData: FormData,
): Promise<AiSettingsState> {
  const session = await verifySession();

  const codeModel = String(formData.get('aiCodeModel') ?? '');
  const searchModel = String(formData.get('aiSearchModel') ?? '');
  const contextMode = String(formData.get('aiContextMode') ?? '');

  const instructions = formData
    .getAll('instruction')
    .map((v) => String(v).trim())
    .filter(Boolean)
    .map((v) => v.slice(0, MAX_INSTRUCTION_LENGTH))
    .slice(0, MAX_INSTRUCTIONS);

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      aiCodeModel: isDebateAiModelId(codeModel) ? codeModel : null,
      aiSearchModel: isSearchModelId(searchModel) ? searchModel : null,
      aiContextMode: isContextMode(contextMode) ? contextMode : null,
      aiInstructions: instructions,
    },
  });

  revalidatePath('/settings');
  return { saved: true };
}
