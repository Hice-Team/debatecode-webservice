// 게시판 목록은 텍스트만 사용한다 — 아이콘/이모지 없음.
// group으로 좌측 네비게이션을 묶는다(일반 / 정보 / 거래).
export const BOARDS = [
  { key: 'free', label: '자유게시판', desc: '풀이 후기, 잡담, 정보 공유', group: 'general' },
  { key: 'notice', label: '공지사항', desc: '서비스 공지와 업데이트', group: 'info' },
  { key: 'mentor', label: '멘토게시판', desc: '현업 멘토의 면접 방어 노하우', group: 'info' },
  { key: 'qna', label: '문의게시판', desc: '서비스 이용 문의와 질문', group: 'info' },
  // SNS도 밖에서 얻어 오는 정보라 정보 그룹에 둔다 — 다른 곳에 쓴 글을 링크로 들여온다
  { key: 'sns', label: 'SNS', desc: '블로그·SNS에 올린 풀이/후기 공유', group: 'info' },
  { key: 'market', label: '중고게시판', desc: '교재·장비 중고 거래', group: 'trade' },
] as const;

export type BoardKey = (typeof BOARDS)[number]['key'];
export type BoardGroupKey = (typeof BOARDS)[number]['group'];

// 좌측 네비게이션 그룹 — 표시 순서를 그대로 따른다.
export const BOARD_GROUPS: Array<{ key: BoardGroupKey; label: string }> = [
  { key: 'general', label: '일반' },
  { key: 'info', label: '정보' },
  { key: 'trade', label: '거래' },
];

export function boardsInGroup(group: BoardGroupKey) {
  return BOARDS.filter((b) => b.group === group);
}

export function boardDesc(key: string): string {
  if (key === ALL_BOARD) return '모든 게시판의 글을 한 곳에서 확인합니다.';
  return BOARDS.find((b) => b.key === key)?.desc ?? '';
}

// 게시판 탭 최상단에 노출되는 가상 보드 — 실제 DB board 값이 아니라 전체 조회를 의미한다.
export const ALL_BOARD = 'all' as const;

export function boardLabel(key: string): string {
  if (key === ALL_BOARD) return '전체';
  return BOARDS.find((b) => b.key === key)?.label ?? key;
}

export function isBoardKey(key: string | undefined): key is BoardKey {
  return !!key && BOARDS.some((b) => b.key === key);
}

export const SNS_PLATFORMS = [
  { key: 'velog', label: 'Velog', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { key: 'instagram', label: 'Instagram', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  { key: 'x', label: 'X (Twitter)', color: 'text-ink-soft bg-gray-100 border-gray-300' },
  { key: 'blog', label: '블로그', color: 'text-brand-700 bg-brand-50 border-brand-200' },
  { key: 'etc', label: '기타', color: 'text-sky-700 bg-sky-50 border-sky-200' },
] as const;

export type SnsPlatformKey = (typeof SNS_PLATFORMS)[number]['key'];

export function platformLabel(key: string | null | undefined): string {
  return SNS_PLATFORMS.find((p) => p.key === key)?.label ?? key ?? '기타';
}

export function platformColor(key: string | null | undefined): string {
  return SNS_PLATFORMS.find((p) => p.key === key)?.color ?? 'text-ink-soft bg-gray-100 border-gray-300';
}
