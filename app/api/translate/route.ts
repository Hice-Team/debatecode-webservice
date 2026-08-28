import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiSession } from '@/app/lib/dal';
import { rateLimit } from '@/app/lib/rate-limit';
import { durableRateLimit } from '@/app/lib/rate-limit-durable';
import { getFreeAiLlmConfig } from '@/app/lib/ai/free-ai';
import { llmChat } from '@/app/lib/ai/llm-interviewer';
import { glossaryLookup } from '@/app/lib/db-glossary';

// 한→영 일괄 번역 — 전역 언어 전환(AutoTranslate)이 화면의 한국어 텍스트를 배치로 보낸다.
//
// ── 왜 두 층으로 나눴는가 ───────────────────────────────────────────────────
// 이 라우트는 인증이 없었다. 그래서 주소만 알면 누구나 서비스 AI 키로 한 번에
// 36,000자를 번역할 수 있었다 — 사실상 공개 LLM 프록시였다. 식별은 x-forwarded-for
// 하나였고 그 헤더는 위조된다. 서비스의 AI 예산 전체가 키 하나에 매달려 있으므로,
// 이 구멍 하나로 면접·debateQ·AI Search가 함께 죽을 수 있었다.
//
// 그렇다고 통째로 로그인 뒤로 넣으면 비로그인 화면(랜딩·문제 목록)의 언어 전환이
// 깨진다. 그래서 나눈다.
//
//   사전 계층   DB 용어(카테고리·난이도 등)는 코드 안의 표로 번역한다.
//               AI를 부르지 않으므로 비로그인도 그대로 쓴다. 비용이 0이다.
//   LLM 계층    사전에 없는 문장만 모델로 번역한다. **로그인 필수**이고,
//               계정 단위로 지속 카운터를 건다.
//
// 비로그인 이용자는 사전에 있는 것까지 번역된 화면을 보고, 나머지는 원문으로 남는다.
// 예전처럼 조용히 요금이 나가는 것보다 낫다.
const schema = z.object({
  texts: z.array(z.string().min(1).max(600)).min(1).max(60),
});

const SYSTEM = `You are a translator for a Korean developer-education website. Translate each Korean string to natural, concise English.
Keep code identifiers, numbers, brand names (debateCode, debateQ, debateMate 등) and punctuation as-is. Do not add explanations.
Reply ONLY with a JSON array of translated strings in the same order and same length as the input array.`;

/**
 * 번역 캐시.
 *
 * 상한이 필요하다. 임의 입력을 받는 자리라 상한이 없으면 아이솔레이트 메모리가
 * 입력 길이에 비례해 계속 늘어난다(rate-limit.ts가 버킷에 상한을 두는 것과 같은 이유).
 * Map은 삽입 순서를 유지하므로 가장 오래된 것부터 버린다.
 */
const MAX_CACHE = 5_000;
const cache = new Map<string, string>();

function remember(source: string, translated: string): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(source, translated);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const { texts } = parsed.data;

  /* ---------- 사전 계층 — 비용이 없고 인증도 필요 없다 ---------- */
  for (const text of texts) {
    if (cache.has(text)) continue;
    const fixed = glossaryLookup(text);
    if (fixed) remember(text, fixed);
  }

  const missing = texts.filter((t) => !cache.has(t));
  if (missing.length === 0) {
    return NextResponse.json({ translations: texts.map((t) => cache.get(t) ?? t) });
  }

  /* ---------- LLM 계층 — 여기부터 서비스 요금이 나간다 ---------- */
  const session = await getApiSession();
  if (!session) {
    // 비로그인은 사전으로 번역된 것까지만 받는다. 오류가 아니라 부분 결과다 —
    // 화면은 번역되지 않은 문장을 원문 그대로 보여 주면 된다.
    return NextResponse.json({
      translations: texts.map((t) => cache.get(t) ?? t),
      partial: true,
      reason: 'login-required',
    });
  }

  // 같은 아이솔레이트 안의 연타를 먼저 끊고,
  if (!rateLimit(`translate:${session.userId}`, 20, 60_000)) {
    return NextResponse.json(
      { translations: texts.map((t) => cache.get(t) ?? t), partial: true, reason: 'rate-limited' },
      { status: 429 },
    );
  }
  // 인스턴스가 바뀌어도 남는 카운터로 하루 총량을 묶는다.
  // Workers에서는 인메모리 카운터가 요청마다 사라져 사실상 세지지 않는다.
  const gate = await durableRateLimit(`translate:${session.userId}`, 120, 60 * 60 * 1000);
  if (!gate.allowed) {
    return NextResponse.json(
      { translations: texts.map((t) => cache.get(t) ?? t), partial: true, reason: 'rate-limited' },
      { status: 429 },
    );
  }

  const config = getFreeAiLlmConfig();
  if (!config) {
    // 번역 수단 없음 — 원문 유지 (클라이언트는 그대로 표시)
    return NextResponse.json({ translations: texts.map((t) => cache.get(t) ?? t), partial: true });
  }

  try {
    const reply = await llmChat(config, SYSTEM, JSON.stringify(missing));
    const match = reply.match(/\[[\s\S]*\]/);
    const arr = match ? (JSON.parse(match[0]) as unknown) : null;
    if (Array.isArray(arr) && arr.length === missing.length && arr.every((x) => typeof x === 'string')) {
      missing.forEach((src, i) => remember(src, arr[i] as string));
    }
  } catch {
    // 번역 실패 — 원문을 그대로 돌려준다
  }

  return NextResponse.json({ translations: texts.map((t) => cache.get(t) ?? t) });
}
