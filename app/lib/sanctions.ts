// 제재 상수와 통지 문안 — 서버 액션과 화면이 함께 쓴다.
//
// 'use server' 파일에서는 async 함수만 export할 수 있어서, 상수는 여기에 둔다.
// 통지 문안 생성도 여기에 있어야 발급 화면의 미리보기와 실제 사용자에게 가는 문구가
// 어긋나지 않는다 — 두 곳에서 따로 만들면 반드시 달라진다.

export const SANCTION_TYPES = ['read', 'post', 'comment'] as const;
export type SanctionType = (typeof SANCTION_TYPES)[number];

export const SANCTION_TYPE_LABEL: Record<SanctionType, string> = {
  read: '커뮤니티 열람',
  post: '글 작성',
  comment: '답글 작성',
};

export const SANCTION_TYPE_DESC: Record<SanctionType, string> = {
  read: '커뮤니티 게시판 자체를 볼 수 없습니다. 가장 강한 제재입니다.',
  post: '새 글을 쓸 수 없습니다. 읽기와 답글은 그대로 가능합니다.',
  comment: '답글을 달 수 없습니다. 읽기와 글쓰기는 그대로 가능합니다.',
};

export function sanctionTypeLabel(type: string): string {
  return SANCTION_TYPE_LABEL[type as SanctionType] ?? type;
}

/** 기간 프리셋 — 자유 입력보다 이쪽이 형평성 시비가 적다. */
export const SANCTION_PRESETS = [
  { days: 1, label: '1일' },
  { days: 3, label: '3일' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
  { days: 0, label: '영구' },
] as const;

export const APPEAL_STATUS_LABEL: Record<string, string> = {
  pending: '이의 접수',
  accepted: '이의 인정',
  rejected: '이의 기각',
};

/** 제재 발급 시 이용자에게 그대로 표시되는 문구. */
export function sanctionNotice(type: string, days: number, reason: string): string {
  const label = sanctionTypeLabel(type);
  const period =
    days > 0
      ? `${days}일간 (${new Date(Date.now() + days * 86400_000).toLocaleString('ko-KR')}까지)`
      : '기한 없이';
  return [
    `${label} 기능이 ${period} 제한되었습니다.`,
    `사유: ${reason || '(사유를 입력하세요)'}`,
    '',
    '제재가 부당하다고 판단되면 문의하기를 통해 이의를 제기할 수 있습니다.',
  ].join('\n');
}
