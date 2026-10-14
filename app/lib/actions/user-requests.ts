'use server';

// 사용자 발신 요청 — 신고 / 문의 / 디베이트메이트 신청 / 문제 초안 제출.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { verifySession, getUser } from '../dal';
import { prisma } from '../prisma';
import { REPORT_TARGETS } from '../report-targets';
import { featureBlockMessage } from '../settings';
import { canAuthorProblems } from '../roles';
import { createClient } from '../supabase/server';
import { safeStorageKey } from '../storage';

/* ---------- 신고 ---------- */

export interface ReportState {
  errors?: { form?: string[] };
  saved?: boolean;
}

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(40),
  detail: z.string().trim().max(1000).optional().or(z.literal('')),
  // 오류 신고에서 재현에 필요한 맥락 — 어느 화면/어떤 코드였는지
  context: z.string().trim().max(4000).optional().or(z.literal('')),
});

export async function submitReport(_prev: ReportState, formData: FormData): Promise<ReportState> {
  const session = await verifySession();
  const parsed = reportSchema.safeParse({
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    reason: formData.get('reason'),
    detail: formData.get('detail') ?? '',
    context: formData.get('context') ?? '',
  });
  if (!parsed.success) return { errors: { form: ['신고 내용을 확인해 주세요.'] } };

  // 같은 대상에 대한 신고를 콘솔에서 하나의 케이스로 묶기 위한 키.
  // 접수 시점에 채워 두면 목록 조회에서 그룹핑을 DB가 해 줄 수 있다.
  const dedupeKey = `${parsed.data.targetType}:${parsed.data.targetId}`;

  // 재현 정보는 사유 뒤에 붙여 한 필드로 저장한다 — 콘솔에서 한 번에 읽히게.
  const detail = [parsed.data.detail || null, parsed.data.context ? `
[재현 정보]
${parsed.data.context}` : null]
    .filter(Boolean)
    .join('');

  await prisma.report.create({
    data: {
      reporterId: session.userId,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      detail: detail || null,
      dedupeKey,
      // 불법정보는 판단이 늦으면 법적 노출이 커지고, 채점 오류는 그대로 두면 이용자가
      // 맞는 답을 틀렸다고 믿게 된다 — 둘 다 접수 즉시 우선순위를 올린다.
      priority: ['illegal', 'wrong_testcase', 'judge_wrong'].includes(parsed.data.reason) ? 'high' : 'normal',
    },
  });
  return { saved: true };
}

/* ---------- 문의 ---------- */

export interface InquiryState {
  errors?: { subject?: string[]; body?: string[]; form?: string[] };
  saved?: boolean;
}

const inquirySchema = z.object({
  subject: z.string().trim().min(2, '제목은 2자 이상이어야 합니다.').max(120),
  body: z.string().trim().min(5, '내용은 5자 이상이어야 합니다.').max(4000),
});

export async function submitInquiry(_prev: InquiryState, formData: FormData): Promise<InquiryState> {
  const user = await getUser();
  const parsed = inquirySchema.safeParse({ subject: formData.get('subject'), body: formData.get('body') });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  await prisma.inquiry.create({
    data: { userId: user.id, email: user.email, subject: parsed.data.subject, body: parsed.data.body },
  });
  return { saved: true };
}

/* ---------- 디베이트메이트 신청 ---------- */

export interface MateApplyState {
  errors?: { motivation?: string[]; attachment?: string[]; form?: string[] };
  saved?: boolean;
}

// 신청서 PDF가 곧 지원서다. 예전에는 동기 20자를 폼 밖에서 요구해
// "제출을 눌러도 아무 일이 없는" 상태를 만들었다 — 이제 받지 않는 값은 검증도 하지 않는다.
const mateSchema = z.object({
  motivation: z.string().trim().max(2000).optional().or(z.literal('')),
});

const MATE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export async function applyDebateMate(_prev: MateApplyState, formData: FormData): Promise<MateApplyState> {
  const user = await getUser();
  if (user.role === 'debate_mate') return { errors: { form: ['이미 디베이트메이트입니다.'] } };

  // 모집을 닫을 때 콘솔에서 끈다
  const blocked = await featureBlockMessage('flag.mate_application', '디베이트메이트 신청이 현재 마감되었습니다.');
  if (blocked) return { errors: { form: [blocked] } };

  const parsed = mateSchema.safeParse({ motivation: formData.get('motivation') ?? '' });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  // 신청서 PDF — 폼에서 필수로 안내하므로 서버에서도 필수/형식/용량을 강제한다.
  const attachment = formData.get('attachment');
  if (!(attachment instanceof File) || attachment.size === 0)
    return { errors: { attachment: ['신청서 PDF를 첨부해 주세요.'] } };
  if (attachment.type !== 'application/pdf' && !attachment.name.toLowerCase().endsWith('.pdf'))
    return { errors: { attachment: ['PDF 파일만 제출할 수 있습니다.'] } };
  if (attachment.size > MATE_ATTACHMENT_MAX_BYTES)
    return { errors: { attachment: ['파일 용량이 너무 큽니다. (최대 10MB)'] } };

  const supabase = await createClient();
  const path = safeStorageKey(user.id, attachment.name);
  const { error: uploadError } = await supabase.storage
    .from('community-uploads')
    .upload(path, attachment, { contentType: 'application/pdf' });
  if (uploadError) return { errors: { attachment: [`파일 업로드에 실패했습니다: ${uploadError.message}`] } };
  const { data: uploaded } = supabase.storage.from('community-uploads').getPublicUrl(path);

  // 재신청 시 이전 신청을 덮어써 pending으로 되돌린다.
  // 값이 없으면 필드를 **넣지 않는다**. null을 넘기면 컬럼이 NOT NULL이던 시절의
  // 클라이언트에서 입력 형태 자체가 어긋나 "user가 없다"는 엉뚱한 오류로 나온다.
  // 넣지 않으면 새 스키마에서는 null이 되고, 옛 클라이언트에서도 탈이 없다.
  const motivation = parsed.data.motivation?.trim() || undefined;

  await prisma.debateMateApplication.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...(motivation ? { motivation } : {}),
      attachmentUrl: uploaded.publicUrl,
      attachmentName: attachment.name,
    },
    update: {
      ...(motivation ? { motivation } : {}),
      attachmentUrl: uploaded.publicUrl,
      attachmentName: attachment.name,
      status: 'pending',
      reviewedById: null,
      reviewedAt: null,
    },
  });
  revalidatePath('/dashboard');
  return { saved: true };
}

/* ---------- 문제 초안 제출 (디베이트메이트/출제자) ---------- */

export interface DraftState {
  errors?: { form?: string[] };
  saved?: boolean;
}

const draftSchema = z.object({
  title: z.string().trim().min(2).max(120),
  difficulty: z.coerce.number().int().min(1).max(4),
  category: z.string().trim().min(1).max(40),
  description: z.string().trim().min(10, '문제 설명을 10자 이상 작성해 주세요.').max(20000),
});

export async function submitProblemDraft(_prev: DraftState, formData: FormData): Promise<DraftState> {
  const user = await getUser();
  if (!canAuthorProblems(user.role)) return { errors: { form: ['문제 출제 권한이 없습니다.'] } };

  // 검토 인력이 부족해 큐가 밀리면 콘솔에서 접수를 잠시 닫는다
  const blocked = await featureBlockMessage('flag.problem_draft');
  if (blocked) return { errors: { form: [blocked] } };

  const parsed = draftSchema.safeParse({
    title: formData.get('title'),
    difficulty: formData.get('difficulty'),
    category: formData.get('category'),
    description: formData.get('description'),
  });
  if (!parsed.success) return { errors: { form: ['문제 정보를 확인해 주세요.'] } };

  // starterCodes / keywords / testCases는 JSON 문자열로 받는다(에디터가 직렬화).
  const parseJson = <T,>(key: string, fallback: T): T => {
    try {
      const raw = formData.get(key);
      return raw ? (JSON.parse(String(raw)) as T) : fallback;
    } catch {
      return fallback;
    }
  };

  const payload = {
    tags: parseJson<string[]>('tags', []),
    timeLimitMs: Number(formData.get('timeLimitMs') ?? 3000) || 3000,
    starterCodes: parseJson<Record<string, string>>('starterCodes', {}),
    keywords: parseJson<string[]>('keywords', []),
    testCases: parseJson<unknown[]>('testCases', []),
  };

  // 저작권 기증 위임서 — donate=on일 때만 위임 기록. 서명자 이름 필수.
  const donate = formData.get('copyrightDonate') === 'on';
  const signerName = String(formData.get('signerName') ?? '').trim();
  if (donate && signerName.length < 2) {
    return { errors: { form: ['저작권 기증에 동의하려면 위임서에 서명자 이름을 입력해야 합니다.'] } };
  }
  const copyrightDelegation = donate
    ? { donated: true, signerName, agreedAt: new Date().toISOString(), scope: 'debateCode 문제 은행 게시·복제·2차저작 이용 위임' }
    : null;

  await prisma.problemDraft.create({
    data: {
      authorId: user.id,
      title: parsed.data.title,
      difficulty: parsed.data.difficulty,
      category: parsed.data.category,
      description: parsed.data.description,
      payload: payload as never,
      copyrightDelegation: copyrightDelegation as never,
    },
  });
  revalidatePath('/dashboard');
  return { saved: true };
}
