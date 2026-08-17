import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/app/lib/rate-limit';
import { getFreeAiLlmConfig } from '@/app/lib/ai/free-ai';
import { getBuiltinLlmConfig } from '@/app/lib/ai/builtin';
import { llmChat } from '@/app/lib/ai/llm-interviewer';
import { glossaryLookup } from '@/app/lib/db-glossary';

// 한→영 일괄 번역 — 전역 언어 전환(AutoTranslate)이 화면의 한국어 텍스트를 배치로 보낸다.
// LLM(Free AI/빌트인)으로 번역하고 서버 메모리에 캐시한다. LLM 미설정 시 원문을 그대로 돌려준다.
const schema = z.object({
  texts: z.array(z.string().min(1).max(600)).min(1).max(60),
});

const SYSTEM = `You are a translator for a Korean developer-education website. Translate each Korean string to natural, concise English.
Keep code identifiers, numbers, brand names (debateCode, debateQ, debateMate 등) and punctuation as-is. Do not add explanations.
Reply ONLY with a JSON array of translated strings in the same order and same length as the input array.`;

const cache = new Map<string, string>();

export async function POST(request: Request) {
  const key = request.headers.get('x-forwarded-for') ?? 'anon';
  if (!rateLimit(`translate:${key}`, 20, 60_000)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const { texts } = parsed.data;

  // 카테고리·난이도처럼 값이 정해진 DB 용어는 사전으로 먼저 확정한다.
  // LLM이 없는 환경에서도 문제집 데이터가 한국어로 남지 않게 하는 경로다.
  for (const text of texts) {
    if (cache.has(text)) continue;
    const fixed = glossaryLookup(text);
    if (fixed) cache.set(text, fixed);
  }

  const results: (string | null)[] = texts.map((t) => cache.get(t) ?? null);
  const missing = texts.filter((_, i) => results[i] === null);

  if (missing.length > 0) {
    const config = getFreeAiLlmConfig() ?? getBuiltinLlmConfig();
    if (!config) {
      // 번역 수단 없음 — 원문 유지 (클라이언트는 그대로 표시)
      return NextResponse.json({ translations: texts });
    }
    try {
      const reply = await llmChat(config, SYSTEM, JSON.stringify(missing));
      const match = reply.match(/\[[\s\S]*\]/);
      const arr = match ? (JSON.parse(match[0]) as unknown) : null;
      if (Array.isArray(arr) && arr.length === missing.length && arr.every((x) => typeof x === 'string')) {
        missing.forEach((src, i) => cache.set(src, arr[i] as string));
      } else {
        return NextResponse.json({ translations: texts });
      }
    } catch {
      return NextResponse.json({ translations: texts });
    }
  }

  return NextResponse.json({ translations: texts.map((t) => cache.get(t) ?? t) });
}
