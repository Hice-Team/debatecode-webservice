// 역할 체계 — User.role 문자열 값과 권한 헬퍼.
// user            일반 사용자
// problem_setter  문제 출제자
// reviewer        검토자 (출제 문제/신고 검토)
// admin           최고 관리자 (권한 부여 포함 전권)
// debate_mate     디베이트메이트 (사용자 문제 출제 파트너)
// partner         협력사
//
// 아래 헬퍼들은 **역할 기본값만** 본다(DB 미조회 · 동기). 내비게이션이나 개인 대시보드처럼
// 요청마다 쿼리를 더 태우기 아까운 표면에서 쓴다.
// 계정별 권한 오버라이드까지 반영해야 하는 콘솔에서는 app/lib/permissions.ts의
// `can()` / `requirePermission()`을 쓴다.

// Role/ROLES/asRole의 원형은 permissions.ts에 있다 — 권한 표가 판단의 단일 출처라
// 그쪽이 이 파일에 의존하면 순환이 된다. 기존 호출부를 위해 여기서 그대로 re-export한다.
import { roleHas, asRole, ROLES, type Role } from './permissions';

export { asRole, ROLES };
export type { Role };

export const ROLE_LABELS: Record<Role, string> = {
  user: '일반 사용자',
  problem_setter: '문제 출제자',
  reviewer: '검토자',
  admin: '최고 관리자',
  debate_mate: '디베이트메이트',
  partner: '협력사',
};

// 역할 한 줄 설명 — 역할 매트릭스/변경 확인 화면에서 "이게 뭘 하는 역할인지" 보여 준다
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  user: '서비스를 이용하는 일반 회원. 관리 콘솔에 들어올 수 없다.',
  problem_setter: '문제를 출제하고 문제집 세트·상점 상품을 편성한다.',
  reviewer: '신고·문의·출제 초안·메이트 신청을 처리하고 제재를 집행한다.',
  admin: '모든 권한. 역할 부여와 시스템 설정 변경이 가능하다.',
  debate_mate: '사용자 출제 파트너. 문제 초안을 올리고 debateQ를 이용한다.',
  partner: '협력사 계정. 콘솔은 열리되 운영 권한은 별도로 부여해야 한다.',
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

export function roleLabel(role: string): string {
  return ROLE_LABELS[asRole(role)];
}

// 아래 헬퍼는 전부 permissions.ts의 역할×권한 표에 위임한다.
// 두 곳에 경계를 따로 적어 두면 반드시 어긋나므로, 판단 기준은 한 곳에만 둔다.

// 관리 콘솔 접근 가능 역할 — 일반 사용자를 제외한 전원
export function hasConsoleAccess(role: string): boolean {
  return roleHas(role, 'console.access');
}

// 서비스(개인) 대시보드도 함께 노출하는 역할 —
// 최고관리자/문제출제자/검토자/디베이트메이트/협력사 모두 두 화면을 본다.
export function seesPersonalDashboard(_role: string): boolean {
  return true;
}

// 역할 부여 권한 — 최고 관리자만
export function canGrantRoles(role: string): boolean {
  return roleHas(role, 'role.grant');
}

// 검토(신고/문제 초안/디베이트메이트 신청) 권한
export function canReview(role: string): boolean {
  return roleHas(role, 'report.review');
}

// 문제 출제(초안 제출) 권한 — 디베이트메이트/출제자/관리자
export function canAuthorProblems(role: string): boolean {
  return roleHas(role, 'problem.author');
}

// 게시 콘텐츠 편성/공개 권한 — 문제집 세트처럼 이용자에게 바로 노출되는 자산을 만들고 지운다.
// 콘솔에 들어올 수 있다고 해서 모두 허용하지 않는다(최소 권한):
// 협력사·디베이트메이트는 콘솔은 보되 공개 콘텐츠를 바꾸지 못한다.
export function canManagePublishedContent(role: string): boolean {
  return roleHas(role, 'problemset.manage');
}
