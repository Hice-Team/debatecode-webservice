// 신고 대상과 사유 — 서비스 화면과 콘솔이 같은 목록을 본다.
//
// 처음에는 커뮤니티(글·답글)만 신고할 수 있었다. 그런데 실제로 이용자가 알려 주고 싶은 것은
// 그것만이 아니다: 문제 지문이 틀렸다, 테스트케이스가 이상하다, AI 답변이 잘못됐다.
// 이런 걸 받을 창구가 없으면 문의로 흘러들어와 분류가 안 된 채 쌓인다.
//
// 그래서 대상 유형을 넓히고, 유형마다 **그 맥락에서 실제로 쓰는 사유**만 보여 준다.
// 게시글에 "테스트케이스 오류"를 띄우거나 문제에 "욕설/비방"을 띄우면 아무도 안 고른다.

export const REPORT_TARGETS = ['post', 'comment', 'user', 'problem', 'editor', 'ai_search'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = {
  post: '게시글',
  comment: '댓글',
  user: '사용자',
  problem: '문제',
  editor: '코드 에디터',
  ai_search: 'AI 답변',
};

/** 신고 모달의 제목 — "무엇을 신고하는지"가 분명해야 사유를 제대로 고른다 */
export const REPORT_TARGET_TITLES: Record<ReportTarget, string> = {
  post: '게시글 신고',
  comment: '댓글 신고',
  user: '사용자 신고',
  problem: '문제 오류 신고',
  editor: '코드 에디터 문제 신고',
  ai_search: 'AI 답변 신고',
};

export const REPORT_TARGET_DESC: Record<ReportTarget, string> = {
  post: '커뮤니티 가이드라인을 위반한 게시글을 알려 주세요.',
  comment: '커뮤니티 가이드라인을 위반한 답글을 알려 주세요.',
  user: '반복적으로 문제를 일으키는 계정을 알려 주세요.',
  problem: '지문·테스트케이스·정답이 잘못됐다면 알려 주세요. 확인 후 수정합니다.',
  editor: '실행·채점이 제대로 되지 않는다면 알려 주세요. 재현에 필요한 내용을 함께 적어 주시면 빠릅니다.',
  ai_search: '사실과 다르거나 부적절한 답변을 알려 주세요.',
};

export interface ReportReason {
  value: string;
  label: string;
}

/** 커뮤니티 계열 — 사람이 올린 콘텐츠 */
const COMMUNITY_REASONS: ReportReason[] = [
  { value: 'spam', label: '스팸/광고' },
  { value: 'abuse', label: '욕설/비방' },
  { value: 'illegal', label: '불법정보' },
  { value: 'etc', label: '기타' },
];

/** 문제 계열 — 콘텐츠 오류 */
const PROBLEM_REASONS: ReportReason[] = [
  { value: 'wrong_statement', label: '지문 오류 (설명이 틀림)' },
  { value: 'wrong_testcase', label: '테스트케이스 오류 (정답인데 틀렸다고 함)' },
  { value: 'unclear', label: '설명이 모호함' },
  { value: 'duplicate', label: '중복 문제' },
  { value: 'etc', label: '기타' },
];

/** 에디터 계열 — 동작 오류 */
const EDITOR_REASONS: ReportReason[] = [
  { value: 'run_fail', label: '실행이 되지 않음' },
  { value: 'judge_wrong', label: '채점 결과가 이상함' },
  { value: 'editor_bug', label: '에디터 오작동 (입력·저장 등)' },
  { value: 'timeout', label: '시간 초과가 비정상적으로 발생' },
  { value: 'etc', label: '기타' },
];

/** AI 계열 — 답변 품질 */
const AI_REASONS: ReportReason[] = [
  { value: 'inaccurate', label: '사실과 다름' },
  { value: 'harmful', label: '부적절·유해한 내용' },
  { value: 'irrelevant', label: '질문과 무관함' },
  { value: 'etc', label: '기타' },
];

export function reasonsFor(target: string): ReportReason[] {
  if (target === 'problem') return PROBLEM_REASONS;
  if (target === 'editor') return EDITOR_REASONS;
  if (target === 'ai_search') return AI_REASONS;
  return COMMUNITY_REASONS;
}

const ALL_REASON_LABELS: Record<string, string> = Object.fromEntries(
  [...COMMUNITY_REASONS, ...PROBLEM_REASONS, ...EDITOR_REASONS, ...AI_REASONS].map((r) => [r.value, r.label]),
);

export function reasonLabel(value: string): string {
  return ALL_REASON_LABELS[value] ?? value;
}

export function targetLabel(target: string): string {
  return REPORT_TARGET_LABELS[target as ReportTarget] ?? target;
}

/** 콘텐츠 오류 계열인가 — 콘솔에서 "가이드라인 위반"과 다른 줄로 다루기 위해 */
export function isDefectReport(target: string): boolean {
  return target === 'problem' || target === 'editor' || target === 'ai_search';
}
