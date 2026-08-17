import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { createClient } from '@/app/lib/supabase/server';
import { decryptSecret } from '@/app/lib/crypto';
import { rateLimit } from '@/app/lib/rate-limit';
import { llmChat, type LlmConfig, type LlmUsage } from '@/app/lib/ai/llm-interviewer';
import { EFFORTS, asEffort, effortDirective, effortMaxTokens } from '@/app/lib/ai/effort';
import { DEBATEAI_MODEL_IDS, findDebateAiModel } from '@/app/lib/ai/debateai-models';
import { resolveDebateAiUpstream } from '@/app/lib/ai/debateai-upstream';
import { addFreeAiUsage, estimateTokens, getFreeAiQuota } from '@/app/lib/ai/free-ai';

// debateAI 챗봇 — 문제 정보와 에디터의 현재 코드를 매 턴 함께 보고 답한다.
//
// 모델은 티어별로 호출 경로가 다르다(app/lib/ai/debateai-upstream.ts).
//   free  서비스 키(HUGGINGFACE_API_KEY) · byok 이용자 키 · pro 서비스 상용 키 · local 이용자 엔드포인트
// 일일 토큰 쿠터는 서비스가 비용을 대는 free/pro에만 적용한다.
const schema = z.object({
  problemId: z.number().int().positive(),
  modelId: z.enum(DEBATEAI_MODEL_IDS),
  language: z.enum(['javascript', 'python']),
  // general 문제 풀이 중 질문 (Ask)
  // agent   답을 하면서 에디터 코드까지 고쳐 준다 (Agent)
  // refactor-why 리팩토링모드 — 방금 만든 결함 코드를 왜 그렇게 만들었는지 설명
  mode: z.enum(['general', 'agent', 'refactor-why']).default('general'),
  effort: z.enum(EFFORTS as [string, ...string[]]).optional(),
  code: z.string().max(50_000).default(''),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4_000) }))
    .max(24)
    .default([]),
});

const SYSTEM_GENERAL = `당신은 debateCode의 학습 도우미 "debateAI"입니다. 사용자는 알고리즘 문제를 풀며 문제 이해와 접근법에 대해 질문합니다.
정답 코드를 통째로 알려주지 말고, 문제 이해를 돕는 개념·접근법·힌트를 단계적으로 설명하세요. 항상 한국어 존댓말로, 간결하게 답합니다.
코드 조각을 보여 줄 때는 반드시 \`\`\`언어 로 시작하는 코드 블록 안에 넣으세요 — 사용자가 그 블록을 바로 에디터로 옮길 수 있습니다.`;

// Agent 모드 — 사용자가 "고쳐 줘"라고 맡긴 자리다. 힌트만 주는 Ask와 목적이 다르므로
// 완성된 코드를 낸다. 다만 에디터를 통째로 덮어쓰기 때문에, 무엇을 왜 바꿨는지 먼저 말하게 한다.
const SYSTEM_AGENT = `당신은 debateCode의 코딩 에이전트 "debateAI"입니다. 사용자가 요청하면 에디터의 코드를 직접 고쳐 줍니다.

다음 형식을 반드시 지키세요.
1. 무엇을 왜 바꿨는지 2~4문장으로 먼저 설명합니다 (한국어 존댓말).
2. 그다음 **파일 전체 코드**를 코드 블록 하나에 담아 출력합니다. 일부만 잘라 내거나 "...(생략)"을 쓰지 마세요.
   블록은 반드시 \`\`\`{언어} 로 시작하고 \`\`\` 로 끝나야 합니다.
3. 코드 블록은 하나만 출력합니다. 설명은 블록 밖에 두세요.

사용자가 코드 수정이 아니라 설명을 요구하면, 코드 블록 없이 설명만 하세요.
함수 이름과 시그니처는 채점기가 호출하는 규약이므로 요청이 없는 한 바꾸지 마세요.`;

// 리팩토링모드 — AI 자신이 만든 결함 코드를 스스로 해명하는 자리다.
// "무엇이 틀렸는지"를 곧바로 알려주면 문제가 사라지므로, 설계 의도와 분석까지만 말한다.
const SYSTEM_REFACTOR_WHY = `당신은 debateCode의 "debateAI"입니다. 당신은 방금 이 알고리즘 문제에 대해 **의도적으로 결함이 있는 코드**를 작성했고,
사용자는 그 코드를 고쳐야 합니다. 지금은 사용자에게 당신의 작업을 설명하는 첫 발언입니다.

다음 순서로, 한국어 존댓말로 간결하게(400자 내외) 작성하세요.
1. 이 문제를 어떻게 분석했는지 — 입력·출력, 핵심 자료구조, 떠올린 접근법
2. 그래서 코드를 어떤 구조로 짰는지
3. 어느 지점을 스스로 미심쩍게 보는지 — **구체적인 버그나 정답은 절대 말하지 마세요.** 어느 영역을 유심히 보라는 수준까지만.

마지막은 사용자가 직접 검토하도록 권하는 한 문장으로 끝맺으세요.`;

/**
 * 답변에서 에디터에 넣을 코드를 꺼낸다.
 *
 * 모델은 지시해도 언어 태그를 빠뜨리거나 설명 안에 짧은 조각을 더 넣곤 한다.
 * 그래서 태그가 맞는 블록을 먼저 찾고, 없으면 가장 긴 블록을 쓴다 —
 * 설명용 한두 줄짜리보다 본문 코드가 언제나 길기 때문이다.
 */
function extractCodeBlock(reply: string, language: 'javascript' | 'python'): string | null {
  const blocks = [...reply.matchAll(/```([\w+-]*)\r?\n([\s\S]*?)```/g)].map((m) => ({
    tag: m[1].toLowerCase(),
    body: m[2].replace(/\s+$/, ''),
  }));
  if (blocks.length === 0) return null;

  const wanted = language === 'python' ? ['python', 'py'] : ['javascript', 'js', 'jsx', 'typescript', 'ts'];
  const tagged = blocks.filter((b) => wanted.includes(b.tag));
  const pool = tagged.length > 0 ? tagged : blocks;
  const best = pool.reduce((a, b) => (b.body.length > a.body.length ? b : a));

  // 한두 줄짜리는 설명용 조각이지 파일 전체가 아니다 — 에디터를 덮어쓸 만한 것이 아니다
  return best.body.split('\n').length >= 3 ? best.body : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const limitKey = user?.id ?? request.headers.get('x-forwarded-for') ?? 'anon';
  if (!rateLimit(`debateai:${limitKey}`, 10, 60_000)) {
    return NextResponse.json({ error: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const { problemId, modelId, language, mode, code, messages } = parsed.data;
  const effort = asEffort(parsed.data.effort);
  // refactor-why는 사용자 발화 없이 AI가 먼저 말하는 자리라 messages가 비어 있을 수 있다
  if (mode !== 'refactor-why' && messages.length === 0) {
    return NextResponse.json({ error: '메시지가 비어 있습니다.' }, { status: 400 });
  }

  const model = findDebateAiModel(modelId);

  // 이용자 AI 설정 — BYOK 키와 로컬 엔드포인트는 암호화 저장이라 복호화해서 쓴다
  const row = user
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, aiApiKey: true, aiBaseUrl: true },
      })
    : null;
  const settings = {
    apiKey: row ? await decryptSecret(row.aiApiKey) : null,
    baseUrl: row ? await decryptSecret(row.aiBaseUrl) : null,
    isMate: row?.role === 'debate_mate',
  };

  // 일일 쿠터는 서비스가 비용을 대는 경우에만 — 개인 키·로컬 실행은 이용자 부담이라 적용하지 않는다
  const serviceFunded = model.tier === 'free' || (model.tier !== 'local' && !settings.apiKey);
  if (user && serviceFunded) {
    const quota = await getFreeAiQuota(user.id);
    if (quota.exhausted) {
      return NextResponse.json(
        {
          error: `오늘의 Debate Free AI 토큰(${quota.limit.toLocaleString()})을 모두 사용했습니다. ${
            quota.resetAt ? quota.resetAt.toLocaleString('ko-KR') : '24시간 후'
          }에 초기화됩니다.`,
        },
        { status: 429 },
      );
    }
  }

  const resolved = resolveDebateAiUpstream(modelId, settings);
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { title: true, category: true, difficulty: true, description: true },
  });
  if (!problem) return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 });

  const SYSTEM =
    mode === 'refactor-why' ? SYSTEM_REFACTOR_WHY : mode === 'agent' ? SYSTEM_AGENT : SYSTEM_GENERAL;

  // 매 턴 문제 + 현재 에디터 코드를 실시간 컨텍스트로 주입한다
  const codeLabel = mode === 'refactor-why' ? '당신이 방금 작성한 코드' : '사용자의 현재 에디터 코드';
  const context = `[문제] ${problem.title} (${problem.category})\n${problem.description.slice(0, 2500)}\n\n[${codeLabel} — ${language}]\n\`\`\`\n${code.slice(0, 6000) || '(아직 비어 있음)'}\n\`\`\``;

  const prompt =
    mode === 'refactor-why'
      ? `${context}\n\n위 내용을 바탕으로 첫 발언을 작성하세요.`
      : [context, ...messages.map((m) => `${m.role === 'user' ? '사용자' : '어시스턴트'}: ${m.content}`)].join('\n\n');

  // 강도는 프롬프트 한 줄과 출력 상한으로만 적용한다 — 공급자 전용 파라미터는 쓰지 않는다
  const system = SYSTEM + effortDirective(effort);
  const maxTokens = effortMaxTokens(effort);

  try {
    let usage: LlmUsage | null = null;
    let usedRepo = (resolved.config as Extract<LlmConfig, { kind: 'openai-compatible' }>).model ?? null;
    let replaced = false;

    const call = (config: LlmConfig) =>
      llmChat(config, system, prompt, {
        timeoutMs: 30_000,
        maxTokens,
        onUsage: (u) => {
          usage = u;
        },
      });

    let reply: string;
    try {
      reply = await call(resolved.config);
    } catch (error) {
      // Free Tier는 라우터에서 모델이 내려가 있는 일이 잦다. 오류를 띄우기 전에 한 번 더.
      if (!resolved.fallbackModel) throw error;
      reply = await call({ ...resolved.config, model: resolved.fallbackModel } as LlmConfig);
      usedRepo = resolved.fallbackModel;
      replaced = true;
    }

    const trimmed = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!trimmed) throw new Error('empty reply');

    // 토큰 — 공급자가 준 값이 있으면 그대로, 없으면 추정치를 넣고 그렇다고 표시한다
    const measured: LlmUsage | null = usage;
    const tokens = measured ?? {
      promptTokens: estimateTokens(context, ...messages.map((m) => m.content)),
      completionTokens: estimateTokens(trimmed),
    };

    // 일일 쿠터 누적 — 응답을 막지 않는다
    if (user && serviceFunded) {
      addFreeAiUsage(user.id, (tokens.promptTokens ?? 0) + (tokens.completionTokens ?? 0), modelId).catch(() => {});
    }

    // Agent 모드는 코드 블록을 따로 뽑아 준다 — 화면이 마크다운을 다시 파싱하지 않아도 되고,
    // 무엇을 에디터에 넣을지 서버와 화면의 판단이 갈리지 않는다.
    const generated = mode === 'agent' ? extractCodeBlock(trimmed, language) : null;
    return NextResponse.json({
      reply: trimmed,
      model: model.id,
      code: generated,
      usage: {
        promptTokens: tokens.promptTokens ?? null,
        completionTokens: tokens.completionTokens ?? null,
        estimated: measured === null,
        effort,
        repo: usedRepo,
        // 고른 모델이 막혀 대체 모델로 답한 경우 — 화면이 이를 밝힌다
        replaced,
      },
    });
  } catch {
    return NextResponse.json({ error: 'AI 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }
}
