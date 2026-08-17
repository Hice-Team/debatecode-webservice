// 실제 LLM 기반 DebateAI 면접관.
// Anthropic·Gemini는 각자의 네이티브 API를, 그 외(OpenAI/Grok/Groq/HuggingFace/로컬/debateBridge)는
// 전부 OpenAI 호환 chat/completions 스펙으로 통합 처리한다.
// 호출 실패나 응답 파싱 실패 시 MockInterviewer로 조용히 폴백한다.
import type {
  CodeAnalysis,
  DefenseReport,
  Language,
  ProblemMeta,
  RoundEval,
  RoundVerdict,
} from '@/app/lib/types';
import type { EvaluateContext, InterviewerProvider, QuestionContext } from './provider';
import { MockInterviewer, analyzeCode } from './mock-interviewer';
import { DEFAULT_INTERVIEW_CONFIG, levelDirective, roundFocusText } from './interview-config';

export type LlmConfig =
  | { kind: 'anthropic'; apiKey: string; model: string | null }
  | { kind: 'gemini'; apiKey: string; model: string | null }
  | { kind: 'openai-compatible'; provider: string; baseUrl: string; apiKey?: string | null; model: string | null };

const SYSTEM_PROMPT = `당신은 debateCode의 시니어 기술 면접관 "DebateAI"입니다.
지원자가 알고리즘 문제의 테스트를 모두 통과한 코드를 들고 왔습니다.
당신의 역할은 코드의 취약점(시간/공간 복잡도, 자료구조 트레이드오프, 엣지 케이스, 설계 결정)을
날카롭게 파고드는 꼬리질문을 던지고, 지원자의 방어 논리를 냉정하게 평가하는 것입니다.
항상 한국어 존댓말로, 압박感 있지만 전문적으로 말하세요.`;

const DEFAULT_MODEL_BY_KIND: Record<string, string> = {
  anthropic: 'claude-sonnet-5',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-5.1',
  grok: 'grok-4.5',
  groq: 'llama-3.3-70b-versatile',
  huggingface: 'meta-llama/Llama-3.3-70B-Instruct',
  local: 'llama3.1',
  bridge: 'llama3.1',
};

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function resolveModel(config: LlmConfig): string {
  if (config.model) return config.model;
  const key = config.kind === 'openai-compatible' ? config.provider : config.kind;
  return DEFAULT_MODEL_BY_KIND[key] ?? 'default';
}

/** 공급자가 알려 준 토큰 사용량 — 주지 않는 공급자도 많아 전부 optional이다. */
export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface LlmChatOptions {
  timeoutMs?: number;
  /** 출력 토큰 상한 — Effort가 정한다 */
  maxTokens?: number;
  /** 호출이 끝나면 공급자가 준 usage를 넘겨준다 (주지 않으면 호출되지 않는다) */
  onUsage?: (usage: LlmUsage) => void;
}

/** 공급자별 usage 필드를 하나의 모양으로 맞춘다. */
function readUsage(raw: unknown): LlmUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  // OpenAI 호환: prompt_tokens/completion_tokens · Anthropic: input_tokens/output_tokens
  const prompt = u.prompt_tokens ?? u.input_tokens;
  const completion = u.completion_tokens ?? u.output_tokens;
  if (typeof prompt !== 'number' && typeof completion !== 'number') return null;
  return {
    promptTokens: typeof prompt === 'number' ? prompt : undefined,
    completionTokens: typeof completion === 'number' ? completion : undefined,
  };
}

// 단발 채팅 헬퍼 — 면접관 외 용도(debateQ 결함 코드 생성 등)에서도 재사용한다.
export async function llmChat(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  options: LlmChatOptions = {},
): Promise<string> {
  // 추론형 모델(DeepSeek R1 등)은 40초를 넘기기도 한다. 호출부가 필요에 따라 늘린다.
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const model = resolveModel(config);

  if (config.kind === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: timeout,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = await res.json();
    const usage = readUsage(data.usage);
    if (usage) options.onUsage?.(usage);
    return data.content?.[0]?.text ?? '';
  }

  if (config.kind === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        signal: timeout,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          ...(options.maxTokens ? { generationConfig: { maxOutputTokens: options.maxTokens } } : {}),
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini API ${res.status}`);
    const data = await res.json();
    const meta = data.usageMetadata;
    if (meta) {
      options.onUsage?.({
        promptTokens: typeof meta.promptTokenCount === 'number' ? meta.promptTokenCount : undefined,
        completionTokens: typeof meta.candidatesTokenCount === 'number' ? meta.candidatesTokenCount : undefined,
      });
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  // openai-compatible: OpenAI 자체, Groq, xAI Grok, Hugging Face 라우터, 로컬(Ollama 등), debateBridge
  const base = config.baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal: timeout,
    headers,
    body: JSON.stringify({
      model,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${config.provider} API ${res.status}`);
  const data = await res.json();
  const usage = readUsage(data.usage);
  if (usage) options.onUsage?.(usage);
  return data.choices?.[0]?.message?.content ?? '';
}

/** 스트리밍 조각 — 사고 과정(reasoning)과 최종 답변(content)을 구분해 흘린다. */
export interface LlmChunk {
  kind: 'reasoning' | 'content';
  text: string;
}

/**
 * 토큰 스트리밍 채팅 — AI Search 진행 단계를 실제 생성 과정과 맞추기 위해 쓴다.
 *
 * OpenAI 호환(=Hugging Face Router, DeepSeek 포함)만 실제로 스트리밍하고,
 * Anthropic·Gemini는 한 번에 받아 한 조각으로 흘려보낸다(호출부는 차이를 몰라도 된다).
 */
export async function* llmChatStream(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  options: LlmChatOptions & { signal?: AbortSignal } = {},
): AsyncGenerator<LlmChunk> {
  if (config.kind !== 'openai-compatible') {
    const text = await llmChat(config, systemPrompt, userPrompt, options);
    if (text) yield { kind: 'content', text };
    return;
  }

  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const base = config.baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({
      model: resolveModel(config),
      stream: true,
      // 마지막 청크에 usage를 실어 달라는 요청 — 무시하는 공급자도 있어 추정치 폴백을 함께 둔다
      stream_options: { include_usage: true },
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`${config.provider} API ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE — 빈 줄로 구분된 이벤트 블록을 순서대로 꺼낸다
      let split = buffer.indexOf('\n\n');
      while (split !== -1) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf('\n\n');

        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let parsed: {
            choices?: Array<{ delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }>;
            usage?: unknown;
          };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue; // 잘린 조각 — 다음 블록에서 이어진다
          }
          // usage는 대개 choices가 빈 마지막 청크에 실려 온다
          const usage = readUsage(parsed.usage);
          if (usage) options.onUsage?.(usage);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;
          // DeepSeek R1은 공급자에 따라 reasoning_content / reasoning 중 하나로 사고 과정을 준다
          const reasoning = delta.reasoning_content ?? delta.reasoning;
          if (reasoning) yield { kind: 'reasoning', text: reasoning };
          if (delta.content) yield { kind: 'content', text: delta.content };
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export class LlmInterviewer implements InterviewerProvider {
  private fallback = new MockInterviewer();

  constructor(private config: LlmConfig) {}

  private async chat(userPrompt: string): Promise<string> {
    return llmChat(this.config, SYSTEM_PROMPT, userPrompt);
  }

  // 설정 화면의 "연결 테스트" — 최소 프롬프트 1회 왕복. 실패 시 throw.
  async ping(): Promise<void> {
    const reply = await this.chat('연결 테스트입니다. "OK"라고만 답하세요.');
    if (!reply.trim()) throw new Error('빈 응답');
  }

  analyze(code: string, language: Language): CodeAnalysis {
    return analyzeCode(code, language);
  }

  async nextQuestion(ctx: QuestionContext): Promise<string> {
    try {
      const historyText = ctx.history
        .map((m) => `${m.role === 'ai' ? '면접관' : '지원자'}: ${m.content}`)
        .join('\n');
      // 면접장 입장 전에 고른 설정이 있으면 그것이 초점과 태도를 정한다
      const config = ctx.config ?? DEFAULT_INTERVIEW_CONFIG;
      const roundFocus = roundFocusText(config, ctx.round);
      const text = await this.chat(
        `## 문제: ${ctx.problem.title} (${ctx.problem.category}, 난이도 ${ctx.problem.difficulty})
## 지원자의 코드:
\`\`\`
${ctx.code ?? '(코드 미제공)'}
\`\`\`
## 지금까지의 대화:
${historyText || '(첫 질문입니다)'}
${ctx.codeChanged ? '\n## 참고: 지원자가 방금 코드를 수정했습니다. 변경을 인지했다는 언급으로 시작하세요.' : ''}

라운드 ${ctx.round}/${config.rounds}의 꼬리질문을 하나만 던지세요. 이번 라운드의 초점은 "${roundFocus}"입니다.
${levelDirective(config.level)}
질문 텍스트만 출력하고, 인사말이나 부연 설명은 하지 마세요.`,
      );
      const question = text.trim();
      if (question.length < 5) throw new Error('empty question');
      return question;
    } catch {
      return this.fallback.nextQuestion(ctx);
    }
  }

  async evaluateAnswer(ctx: EvaluateContext): Promise<RoundEval> {
    try {
      const text = await this.chat(
        `## 문제: ${ctx.problem.title} (핵심 개념: ${ctx.problem.keywords.join(', ')})
## 지원자의 코드:
\`\`\`
${ctx.code}
\`\`\`
## 면접관의 질문: ${ctx.question}
## 지원자의 답변: ${ctx.answer}

이 답변을 평가해 아래 JSON만 출력하세요 (다른 텍스트 금지):
{"score": 0-100 정수, "verdict": "DEFENDED"|"PARTIAL"|"CONCEDED", "feedback": "한국어 한두 문장 피드백", "matchedKeywords": ["답변이 잘 짚은 개념"], "missedKeywords": ["놓친 핵심 개념"]}
기준: 70점 이상 DEFENDED, 40-69 PARTIAL, 40 미만 CONCEDED. 근거 없는 단답은 낮게 평가하세요.`,
      );
      const parsed = extractJson(text) as {
        score?: number;
        verdict?: string;
        feedback?: string;
        matchedKeywords?: string[];
        missedKeywords?: string[];
      } | null;
      if (!parsed || typeof parsed.score !== 'number') throw new Error('bad json');
      const score = Math.max(0, Math.min(100, Math.round(parsed.score)));
      const verdict: RoundVerdict = ['DEFENDED', 'PARTIAL', 'CONCEDED'].includes(parsed.verdict ?? '')
        ? (parsed.verdict as RoundVerdict)
        : score >= 70
          ? 'DEFENDED'
          : score >= 40
            ? 'PARTIAL'
            : 'CONCEDED';
      return {
        round: ctx.round,
        question: ctx.question,
        answer: ctx.answer,
        verdict,
        score,
        feedback: parsed.feedback ?? '',
        matchedKeywords: Array.isArray(parsed.matchedKeywords) ? parsed.matchedKeywords.slice(0, 6) : [],
        missedKeywords: Array.isArray(parsed.missedKeywords) ? parsed.missedKeywords.slice(0, 4) : [],
      };
    } catch {
      return this.fallback.evaluateAnswer(ctx);
    }
  }

  async finalReport(
    rounds: RoundEval[],
    analysis: CodeAnalysis,
    problem: ProblemMeta,
  ): Promise<DefenseReport> {
    // 점수 집계는 결정적으로 계산하고, 총평 문장만 LLM에 맡긴다
    const base = await this.fallback.finalReport(rounds, analysis, problem);
    try {
      const text = await this.chat(
        `## 면접 결과 요약
문제: ${problem.title} (${problem.category})
${rounds.map((r) => `R${r.round} [${r.verdict} ${r.score}점] Q: ${r.question}\nA: ${r.answer}`).join('\n')}

이 지원자에 대한 면접관 총평을 한국어 2~3문장으로 작성하세요. 잘한 점과 보완점을 구체적으로 짚고, 총평 텍스트만 출력하세요.`,
      );
      const summary = text.trim();
      return summary.length >= 10 ? { ...base, summary } : base;
    } catch {
      return base;
    }
  }
}
