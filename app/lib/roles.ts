// 역할 체계 — User.role 문자열 값과 권한 헬퍼.
// user            일반 사용자
// problem_setter  문제 출제자
// reviewer        검토자 (출제 문제/신고 검토)
// admin           최고 관리자 (권한 부여 포함 전권)
// debate_mate     디베이트메이트 (사용자 문제 출제 파트너)
// partner         협력사

export type Role = 'user' | 'problem_setter' | 'reviewer' | 'admin' | 'debate_mate' | 'partner';

export const ROLES: Role[] = ['user', 'problem_setter', 'reviewer', 'admin', 'debate_mate', 'partner'];

export const ROLE_LABELS: Record<Role, string> = {
  user: '일반 사용자',
  problem_setter: '문제 출제자',
  reviewer: '검토자',
  admin: '최고 관리자',
  debate_mate: '디베이트메이트',
  partner: '협력사',
};

// 역할 배지 스타일 (Tailwind 클래스)
export const ROLE_BADGE: Record<Role, string> = {
  user: 'border-ink/10 bg-paper text-ink-soft/50',
  problem_setter: 'border-sky-200 bg-sky-50 text-sky-700',
  reviewer: 'border-violet-200 bg-violet-50 text-violet-700',
  admin: 'border-brand-200 bg-brand-50 text-brand-700',
  debate_mate: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  partner: 'border-amber-200 bg-amber-50 text-amber-700',
};

function asRole(role: string): Role {
  return (ROLES as string[]).includes(role) ? (role as Role) : 'user';
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[asRole(role)];
}

// 관리 콘솔 접근 가능 역할 — 일반 사용자를 제외한 전원
export function hasConsoleAccess(role: string): boolean {
  return asRole(role) !== 'user';
}

// 서비스(개인) 대시보드도 함께 노출하는 역할 —
// 최고관리자/문제출제자/검토자/디베이트메이트/협력사 모두 두 화면을 본다.
export function seesPersonalDashboard(_role: string): boolean {
  return true;
}

// 역할 부여 권한 — 최고 관리자만
export function canGrantRoles(role: string): boolean {
  return asRole(role) === 'admin';
}

// 검토(신고/문제 초안/디베이트메이트 신청) 권한
export function canReview(role: string): boolean {
  const r = asRole(role);
  return r === 'admin' || r === 'reviewer';
}

// 문제 출제(초안 제출) 권한 — 디베이트메이트/출제자/관리자
export function canAuthorProblems(role: string): boolean {
  const r = asRole(role);
  return r === 'debate_mate' || r === 'problem_setter' || r === 'admin';
}

// 게시 콘텐츠 편성/공개 권한 — 문제집 세트처럼 이용자에게 바로 노출되는 자산을 만들고 지운다.
// 콘솔에 들어올 수 있다고 해서 모두 허용하지 않는다(최소 권한):
// 협력사·디베이트메이트는 콘솔은 보되 공개 콘텐츠를 바꾸지 못한다.
export function canManagePublishedContent(role: string): boolean {
  const r = asRole(role);
  return r === 'admin' || r === 'reviewer' || r === 'problem_setter';
}
