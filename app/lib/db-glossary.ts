// DB 콘텐츠 KO→EN 고정 용어사전.
//
// 문제 카테고리·태그·난이도처럼 값의 범위가 정해진 DB 데이터는 LLM 번역에 맡기면
// 매번 표현이 흔들리고, LLM이 없는 환경에서는 아예 한국어로 남는다.
// 여기에 정의된 항목은 /api/translate가 LLM보다 먼저 적용하므로
// 번역 수단이 없어도 항상 같은 영어 표기가 나온다.

export const DB_GLOSSARY: Record<string, string> = {
  // 문제 카테고리
  해시: 'Hash',
  스택: 'Stack',
  큐: 'Queue',
  힙: 'Heap',
  정렬: 'Sorting',
  탐색: 'Search',
  완전탐색: 'Brute Force',
  이분탐색: 'Binary Search',
  그리디: 'Greedy',
  그래프: 'Graph',
  트리: 'Tree',
  DP: 'DP',
  동적계획법: 'Dynamic Programming',
  자료구조: 'Data Structures',
  문자열: 'String',
  구현: 'Implementation',
  수학: 'Math',
  재귀: 'Recursion',
  백트래킹: 'Backtracking',
  시뮬레이션: 'Simulation',
  투포인터: 'Two Pointers',
  슬라이딩윈도우: 'Sliding Window',
  비트마스크: 'Bitmask',
  최단경로: 'Shortest Path',
  분할정복: 'Divide and Conquer',

  // 난이도
  입문: 'Beginner',
  초급: 'Easy',
  중급: 'Medium',
  고급: 'Hard',

  // 문제집 세트 유형
  '기출 모음집': 'Past Exams',
  '실전 모의고사': 'Mock Test',
  '테마 문제집': 'Themed Set',

  // 게시판
  자유게시판: 'Free Board',
  공지사항: 'Notices',
  멘토게시판: 'Mentor Board',
  문의게시판: 'Q&A Board',
  중고게시판: 'Marketplace',
  블로그: 'Blog',
  기타: 'Other',

  // 역할
  '일반 사용자': 'Member',
  '문제 출제자': 'Problem Setter',
  검토자: 'Reviewer',
  '최고 관리자': 'Administrator',
  디베이트메이트: 'DebateMate',
  협력사: 'Partner',
  관리자: 'Admin',
};

/** 사전에 있으면 고정 번역을, 없으면 null을 반환한다. */
export function glossaryLookup(text: string): string | null {
  return DB_GLOSSARY[text.trim()] ?? null;
}
