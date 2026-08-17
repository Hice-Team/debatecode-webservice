// 발송 대상 구분 — 클라이언트/서버 공용. prisma를 끌어오지 않는다.
//
// 작성 화면(클라이언트 컴포넌트)이 라벨을 쓰는데, marketing.ts는 DB에 붙어 있어서
// 그대로 import하면 pg 드라이버가 브라우저 번들로 딸려 들어간다. 순수 값만 따로 둔다.

export type Audience = 'all' | 'members' | 'guests';

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: '전체 동의자',
  members: '회원만',
  guests: '비회원만',
};

export function isAudience(value: unknown): value is Audience {
  return value === 'all' || value === 'members' || value === 'guests';
}
