// 가입 위저드 선택지 — 서버 액션(zod 검증)과 클라이언트 UI가 공유한다.
// 'use server' 파일은 async 함수만 export할 수 있으므로 상수는 이 모듈에 둔다.

export const GENDER_OPTIONS = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'other', label: '기타' },
  { value: 'undisclosed', label: '밝히지 않음' },
] as const;

export const POSITION_OPTIONS = [
  { value: 'frontend', label: '프론트엔드' },
  { value: 'backend', label: '백엔드' },
  { value: 'fullstack', label: '풀스택' },
  { value: 'mobile', label: '모바일' },
  { value: 'data-ai', label: '데이터 / AI' },
  { value: 'devops', label: 'DevOps / 인프라' },
  { value: 'security', label: '보안' },
  { value: 'game', label: '게임' },
  { value: 'embedded', label: '임베디드' },
  { value: 'student', label: '학생 / 취업 준비' },
] as const;

export const INTEREST_OPTIONS = [
  { value: 'algorithm', label: '알고리즘' },
  { value: 'data-structure', label: '자료구조' },
  { value: 'coding-test', label: '코딩테스트' },
  { value: 'tech-interview', label: '기술면접' },
  { value: 'frontend', label: '프론트엔드' },
  { value: 'backend', label: '백엔드' },
  { value: 'ai-ml', label: 'AI / ML' },
  { value: 'data', label: '데이터 엔지니어링' },
  { value: 'mobile', label: '모바일' },
  { value: 'devops', label: 'DevOps' },
  { value: 'cs-basic', label: 'CS 기초' },
  { value: 'security', label: '보안 / CTF' },
] as const;

export const REFERRAL_OPTIONS = [
  { value: 'search', label: '검색 (구글/네이버 등)' },
  { value: 'sns', label: 'SNS (인스타그램/X 등)' },
  { value: 'youtube', label: '유튜브' },
  { value: 'friend', label: '친구 / 지인 추천' },
  { value: 'school', label: '학교 / 수업' },
  { value: 'community', label: '개발 커뮤니티' },
  { value: 'etc', label: '기타' },
] as const;

export const GENDER_VALUES = GENDER_OPTIONS.map((o) => o.value);
export const POSITION_VALUES = POSITION_OPTIONS.map((o) => o.value);
export const INTEREST_VALUES = INTEREST_OPTIONS.map((o) => o.value);
export const REFERRAL_VALUES = REFERRAL_OPTIONS.map((o) => o.value);

export const MAX_INTERESTS = 5;

// 소셜 가입 시 약관 동의 상태를 OAuth 왕복 동안 보존하는 쿠키
export const SIGNUP_CONSENT_COOKIE = 'dc-signup-consent';
