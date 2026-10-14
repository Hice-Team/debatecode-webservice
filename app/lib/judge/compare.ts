// 채점 비교 — 기대 출력과 실제 출력이 같은가.
//
// 이 파일이 단일 출처다. 예전에는 같은 deepEqual이 js-runner.js와 py-runner.js에
// 각각 복사돼 있었고, 두 언어의 채점 기준이 조용히 갈릴 수 있었다(부동소수 허용 오차를
// 한쪽만 고치는 식으로). 이제 워커는 **실행만** 하고 비교는 하지 않는다.
//
// 서버와 클라이언트가 함께 import 한다 — DB·비밀값을 두지 않는다.
//   서버   최종 판정. 이 값만 기록되고 점수·포인트로 이어진다.
//   화면   예제 케이스의 즉시 표시. 서버 응답이 오면 그 값으로 덮어쓴다.

/** 부동소수 비교 허용 오차 — 1e-9. 두 언어가 같은 기준을 쓴다. */
const EPSILON = 1e-9;

/**
 * 깊은 값 비교.
 *
 * 규칙을 명시해 둔다(문제 데이터가 JSON이라 타입이 느슨하다):
 *   · 숫자는 EPSILON 이내면 같다 — 파이썬의 나눗셈 결과와 JS의 결과가 마지막 자리에서
 *     갈리는 일이 흔하다. 그걸 오답으로 처리하면 맞는 풀이가 틀렸다고 나온다.
 *   · 배열은 순서까지 같아야 한다.
 *   · 객체는 키 집합과 각 값이 같아야 한다(순서는 무관).
 *   · undefined와 null은 같게 본다 — 파이썬의 None이 JSON을 거치며 null이 되고,
 *     JS에서 반환값이 없으면 undefined다. 둘 다 "값이 없음"이라는 같은 뜻이다.
 */
export function judgeEqual(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;

  // "값이 없음"의 두 표현
  if (actual == null && expected == null) return true;
  if (actual == null || expected == null) return false;

  if (typeof actual === 'number' && typeof expected === 'number') {
    if (Number.isNaN(actual) && Number.isNaN(expected)) return true;
    return Math.abs(actual - expected) < EPSILON;
  }

  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
    if (actual.length !== expected.length) return false;
    return actual.every((v, i) => judgeEqual(v, expected[i]));
  }

  if (typeof actual === 'object' && typeof expected === 'object') {
    const a = actual as Record<string, unknown>;
    const b = expected as Record<string, unknown>;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.hasOwn(b, k) && judgeEqual(a[k], b[k]));
  }

  return false;
}

/**
 * 워커가 돌려준 출력값을 저장·전송 가능한 형태로 좁힌다.
 *
 * 사용자 코드는 무엇이든 반환할 수 있다 — 순환 참조가 있는 객체, 10MB짜리 배열,
 * 함수. 그대로 JSON으로 만들려 하면 요청 자체가 실패하거나 서버가 거대한 본문을 받는다.
 * 값의 "모양"만 남기고 크기를 자른다. 비교는 이 좁혀진 값으로 한다 —
 * 잘릴 만큼 큰 출력은 어차피 기대 출력과 같을 수 없다.
 */
export function normalizeOutput(value: unknown, depth = 0): unknown {
  if (value === undefined) return null;
  if (value === null) return null;

  const t = typeof value;
  if (t === 'number') return Number.isFinite(value as number) ? value : String(value);
  if (t === 'boolean') return value;
  if (t === 'bigint') return Number(value);
  if (t === 'string') {
    const s = value as string;
    return s.length > MAX_STRING ? s.slice(0, MAX_STRING) : s;
  }
  if (t === 'function' || t === 'symbol') return null;

  if (depth >= MAX_DEPTH) return null;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map((v) => normalizeOutput(v, depth + 1));
  }

  if (t === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ITEMS)) {
      out[k] = normalizeOutput(v, depth + 1);
    }
    return out;
  }

  return null;
}

const MAX_DEPTH = 12;
const MAX_ITEMS = 5_000;
const MAX_STRING = 20_000;

/** 화면에 보여 줄 짧은 표현 — 긴 값은 잘라서 한 줄로. */
export function previewValue(value: unknown, limit = 200): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
