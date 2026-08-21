// 지속 레이트 리밋 — 인스턴스가 바뀌어도 횟수가 남는다.
//
// 왜 따로 두는가. rate-limit.ts는 인메모리다. 단일 서버에서는 맞는 선택이고 빠르지만,
// Cloudflare Workers에서는 요청마다 다른 아이솔레이트에 붙고 그 메모리는 수시로 사라진다.
// 즉 운영에서 "5분에 10번"은 사실상 세지지 않는다 — 공격자는 그냥 계속 시도하면 된다.
//
// 그렇다고 모든 요청을 DB로 세면 왕복 비용이 붙는다. 그래서 나눈다.
//
//   인메모리(rate-limit.ts)   같은 아이솔레이트 안의 연타를 막는 값싼 1차 방어.
//                             AI 호출·첨부 업로드처럼 "비용"이 문제인 곳.
//   지속(이 파일)             틀린 횟수가 곧 보안인 곳 — 로그인, 비밀번호 재설정,
//                             가입, 2차 인증. 여기서는 DB 왕복 한 번이 아깝지 않다.
//
// 한계를 분명히 해 둔다: 이것은 **무차별 대입 방어**이지 DDoS 방어가 아니다.
// 대량 트래픽은 애플리케이션에 닿기 전에 막아야 하며, 그건 Cloudflare WAF·Rate Limiting
// Rules의 몫이다(DEPLOY.md 참고). 여기까지 온 요청은 이미 비용이 발생한 요청이다.
import { prisma } from './prisma';
import { rateLimit } from './rate-limit';

export interface DurableLimitResult {
  allowed: boolean;
  /** 현재 창에서의 시도 횟수 */
  count: number;
  /** 창이 풀릴 때까지 남은 시간(ms) */
  retryAfterMs: number;
}

/**
 * 횟수를 하나 올리고 한도를 넘었는지 돌려준다.
 *
 * 증가와 판정을 SQL 함수 한 번으로 처리한다. 애플리케이션에서 읽고-쓰면 동시에 들어온
 * 두 요청이 같은 값을 읽어 둘 다 통과하는 경쟁이 생긴다 — 무차별 대입을 막겠다면서
 * 동시 요청에 뚫리는 것은 의미가 없다.
 *
 * DB에 닿지 못하면 **막는 쪽으로 판단한다**(fail closed). 로그인 같은 자리에서 저장소가
 * 흔들릴 때 문을 열어 두면, 그 순간이 바로 노려지는 시점이다.
 */
export async function durableRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<DurableLimitResult> {
  // 1차 방어 — 같은 아이솔레이트 안의 연타는 DB에 가기 전에 끊는다.
  // 한도를 넉넉히 잡아(3배) 정상 이용자는 걸리지 않게 한다.
  if (!rateLimit(`durable:${key}`, limit * 3, windowMs)) {
    return { allowed: false, count: limit * 3, retryAfterMs: windowMs };
  }

  try {
    const rows = await prisma.$queryRaw<
      { allowed: boolean; current_count: number; retry_after_ms: number }[]
    >`SELECT * FROM public.rate_limit_hit(${key}, ${limit}::int, ${windowMs}::int)`;

    const row = rows[0];
    if (!row) return { allowed: false, count: limit, retryAfterMs: windowMs };
    return {
      allowed: row.allowed,
      count: Number(row.current_count),
      retryAfterMs: Number(row.retry_after_ms),
    };
  } catch {
    // 저장소에 닿지 못했다 — 막는다
    return { allowed: false, count: limit, retryAfterMs: windowMs };
  }
}

/** 남은 시간을 사람이 읽는 문구로 — "잠시 후"는 얼마나 기다릴지 알려주지 않는다. */
export function retryAfterLabel(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}분`;
  return `${Math.ceil(minutes / 60)}시간`;
}

/**
 * 만료된 카운터 정리 — 표가 무한히 자라지 않게 한다.
 * 관리 콘솔의 점검 화면이나 예약 작업에서 부른다.
 */
export async function sweepRateLimits(): Promise<number> {
  const rows = await prisma
    .$queryRaw<{ rate_limit_sweep: number }[]>`SELECT public.rate_limit_sweep()`
    .catch(() => []);
  return Number(rows[0]?.rate_limit_sweep ?? 0);
}
