// 권한 체계 — 역할이 주는 기본 권한 + 계정별 오버라이드.
//
// 왜 역할만으로는 부족한가:
//   "이 사람에게 신고 처리만 맡기고 싶다"가 안 된다. 검토자로 올리면 회원·제재까지 딸려 오고,
//   반대로 문제를 일으킨 검토자에게서 제재 권한만 빼앗을 방법도 없다. 역할을 통째로 바꾸는 것
//   말고는 손댈 곳이 없어서, 결국 필요 이상으로 큰 권한을 주게 된다.
//
// 그래서 두 층으로 나눈다:
//   1) 역할 = 권한 묶음 (ROLE_PERMISSIONS) — 대부분의 계정은 여기서 끝난다
//   2) PermissionGrant = 계정별 예외 (allow 추가 / deny 차단) — deny가 allow보다 세다
//
// 이 파일은 **순수 카탈로그**다 — DB를 건드리지 않으므로 클라이언트 컴포넌트에서도
// import할 수 있다(역할×권한 매트릭스가 그렇게 쓴다).
// 오버라이드까지 반영한 실제 판정(can/requirePermission)은 permissions-server.ts에 있다.
/* ---------- 역할 원형 ---------- */

// Role/ROLES의 정의를 여기에 둔다. roles.ts가 이 파일에 의존하므로(권한 표가 판단의
// 단일 출처), 반대 방향 import를 만들면 순환이 된다. roles.ts가 그대로 re-export한다.

export type Role = 'user' | 'problem_setter' | 'reviewer' | 'admin' | 'debate_mate' | 'partner';

export const ROLES: Role[] = ['user', 'problem_setter', 'reviewer', 'admin', 'debate_mate', 'partner'];

export function asRole(role: string): Role {
  return (ROLES as string[]).includes(role) ? (role as Role) : 'user';
}

/* ---------- 권한 카탈로그 ---------- */

export type PermissionGroup = 'console' | 'queue' | 'content' | 'access' | 'growth' | 'system';

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  console: '콘솔',
  queue: '처리 큐',
  content: '콘텐츠',
  access: '접근 제어',
  growth: '성장',
  system: '시스템',
};

interface PermissionDef {
  label: string;
  group: PermissionGroup;
  description: string;
  /** 잘못 주면 피해가 큰 권한 — 매트릭스에서 붉게 표시한다 */
  sensitive?: boolean;
}

export const PERMISSIONS = {
  'console.access': {
    label: '콘솔 접속',
    group: 'console',
    description: '관리 콘솔에 들어올 수 있다. 이 권한이 없으면 나머지 권한도 쓸 화면이 없다.',
  },

  'report.review': {
    label: '신고 처리',
    group: 'queue',
    description: '신고 큐를 열람하고 처리완료/기각한다.',
  },
  'inquiry.respond': {
    label: '문의 응대',
    group: 'queue',
    description: '사용자 문의에 답변하고 보관한다.',
  },
  'problem.review': {
    label: '문제 검토',
    group: 'queue',
    description: '출제 초안을 승인해 문제 은행에 게시하거나 반려한다.',
  },
  'mate.review': {
    label: '메이트 심사',
    group: 'queue',
    description: '디베이트메이트 신청을 승인·반려하고 권한을 회수한다.',
  },
  'point.review': {
    label: '포인트·주문 심사',
    group: 'queue',
    description: '활동 인증을 승인해 포인트를 지급하고 상점 주문을 발급한다.',
    sensitive: true,
  },

  'problem.manage': {
    label: '문제 수정·삭제',
    group: 'content',
    description: '게시된 문제를 고치거나 내린다. 오답 지문·잘못된 테스트케이스를 바로 고칠 수 있다.',
    sensitive: true,
  },
  'problem.author': {
    label: '문제 출제',
    group: 'content',
    description: '문제 초안을 작성해 검토큐에 올린다.',
  },
  'problemset.manage': {
    label: '문제집 세트 편성',
    group: 'content',
    description: '기출·모의고사 세트를 만들고 공개한다.',
  },
  'shop.manage': {
    label: '상점 상품 관리',
    group: 'content',
    description: '디베이트샵 상품을 등록·수정한다.',
  },
  'announcement.manage': {
    label: '공지 팝업',
    group: 'content',
    description: '전체 공지 팝업을 게시하고 내린다.',
  },
  'community.moderate': {
    label: '커뮤니티 조치',
    group: 'content',
    description: '게시글·댓글을 삭제한다.',
    sensitive: true,
  },

  'member.read': {
    label: '회원 조회',
    group: 'access',
    description: '회원 디렉터리와 제재 이력을 본다. 이름은 마스킹된 값만 내려간다.',
  },
  'role.grant': {
    label: '역할 변경',
    group: 'access',
    description: '다른 계정의 역할을 바꾼다.',
    sensitive: true,
  },
  'permission.grant': {
    label: '개별 권한 부여',
    group: 'access',
    description: '역할과 별개로 특정 권한을 열어 주거나 잠근다.',
    sensitive: true,
  },
  'sanction.issue': {
    label: '제재 발급',
    group: 'access',
    description: '열람·글·답글 제한을 건다.',
    sensitive: true,
  },
  'sanction.lift': {
    label: '제재 해제',
    group: 'access',
    description: '제재를 풀고 이의제기를 처리한다.',
    sensitive: true,
  },
  'audit.read': {
    label: '감사 로그 열람',
    group: 'access',
    description: '콘솔에서 일어난 모든 변경 이력을 본다.',
  },

  'marketing.send': {
    label: '홍보 메일 발송',
    group: 'growth',
    description: '수신 동의자에게 메일을 보낸다. 되돌릴 수 없다.',
    sensitive: true,
  },

  'ranking.manage': {
    label: '시즌 · 랭킹 운영',
    group: 'system',
    description: '시즌 번호를 다시 매기고, 전체 또는 특정 계정의 랭킹을 초기화한다.',
    sensitive: true,
  },

  'feedback.read': {
    label: 'AI 피드백 열람',
    group: 'system',
    description: 'AI Search 답변에 이용자가 남긴 평가와 사유를 집계해서 본다.',
  },

  'setting.read': {
    label: '시스템 상태 열람',
    group: 'system',
    description: '헬스 대시보드와 런타임 설정 값을 본다.',
  },
  'setting.write': {
    label: '런타임 설정 변경',
    group: 'system',
    description: '기능 플래그·한도·연동 설정을 바꾼다. 서비스 동작이 즉시 달라진다.',
    sensitive: true,
  },
  'maintenance.toggle': {
    label: '유지보수 모드',
    group: 'system',
    description: '전체 서비스를 점검 화면으로 돌린다.',
    sensitive: true,
  },
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function permissionLabel(permission: string): string {
  return (PERMISSIONS as Record<string, PermissionDef>)[permission]?.label ?? permission;
}

/* ---------- 역할별 기본 권한 ---------- */

// 기존 roles.ts 헬퍼(canReview / canGrantRoles / canManagePublishedContent …)가 만들던
// 경계를 그대로 옮겨 놓은 것이다. 한 곳만 의도적으로 좁혔다:
// 제재 발급/해제가 예전에는 "콘솔에 들어올 수 있는 역할 전원"이었는데(협력사·메이트 포함),
// 최소 권한 원칙에 맞지 않아 검토자·최고관리자로 좁혔다.
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  user: [],

  partner: ['console.access'],

  // 메이트는 출제 파트너다. 자기가 만든 문제의 오류를 직접 고치고 문제집까지 엮을 수
  // 있어야 실제로 콘텐츠가 굴러간다 — 매번 운영진을 거치면 병목이 된다.
  debate_mate: ['console.access', 'problem.author', 'problem.manage', 'problemset.manage'],

  problem_setter: [
    'console.access',
    'problem.author',
    'problem.manage',
    'problemset.manage',
    'shop.manage',
    'setting.read',
  ],

  reviewer: [
    'console.access',
    'report.review',
    'inquiry.respond',
    'problem.review',
    'problem.manage',
    'mate.review',
    'point.review',
    'problemset.manage',
    'shop.manage',
    'community.moderate',
    'member.read',
    'sanction.issue',
    'sanction.lift',
    'audit.read',
    'feedback.read',
    'ranking.manage',
    'setting.read',
  ],

  admin: ALL_PERMISSIONS,
};

/** 역할 기본값만 본다 — DB를 읽지 않는 동기 검사. 오버라이드는 반영되지 않는다. */
export function roleHas(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[asRole(role)].includes(permission);
}

/**
 * 역할을 바꾸면 실제로 늘거나 주는 권한.
 *
 * 확인 화면에서 그대로 보여 준다 — "검토자로 올린다"가 무슨 뜻인지 역할 이름만으로는
 * 알 수 없다. 동기 함수라 클라이언트가 서버 왕복 없이 즉시 계산한다.
 */
export function rolePermissionDiff(from: string, to: string): { gained: string[]; lost: string[] } {
  const before = new Set<Permission>(ROLE_PERMISSIONS[asRole(from)]);
  const after = new Set<Permission>(ROLE_PERMISSIONS[asRole(to)]);
  return {
    gained: [...after].filter((p) => !before.has(p)).map(permissionLabel),
    lost: [...before].filter((p) => !after.has(p)).map(permissionLabel),
  };
}
