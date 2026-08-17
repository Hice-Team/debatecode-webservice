// 인메모리 슬라이딩 윈도우 레이트 리미터.
// 단일 인스턴스 배포 전제 — 수평 확장 시 Redis/Upstash 등으로 교체 필요.
import { headers } from 'next/headers';

interface Bucket {
  timestamps: number[];
}

const globalStore = globalThis as unknown as {
  __rateLimitBuckets?: Map<string, Bucket>;
};
const buckets = (globalStore.__rateLimitBuckets ??= new Map<string, Bucket>());

const MAX_BUCKETS = 10_000; // 메모리 상한 — 초과 시 오래된 것부터 정리

/**
 * key 기준으로 windowMs 안에 limit회를 초과하면 false를 반환한다.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) {
      // 가장 먼저 들어온 키부터 제거 (Map은 삽입 순서 유지)
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= limit) return false;
  bucket.timestamps.push(now);
  return true;
}

/** 요청자 IP 식별 — 프록시 뒤에서는 x-forwarded-for의 첫 항목을 사용 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}
