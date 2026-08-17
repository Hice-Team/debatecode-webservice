// 헤더/푸터 공용 메뉴 정의 — 클라이언트·서버 어디서든 import 가능한 순수 데이터 모듈.
export const NAV_MENUS = [
  { href: '/study', key: 'study', label: '학습' },
  { href: '/problems', key: 'problems', label: '문제집' },
  { href: '/contests', key: 'contests', label: '코딩테스트' },
  { href: '/community', key: 'community', label: '커뮤니티' },
  { href: '/debate-mate', key: 'debate-mate', label: '디베이트메이트' },
] as const;
