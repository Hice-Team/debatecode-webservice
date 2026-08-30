// 브라우저에 쌓인 이 서비스의 흔적을 종류별로 지운다.
//
// 서버 데이터와 브라우저 데이터는 성격이 다르다. 서버 쪽은 "내 계정의 기록"이고,
// 브라우저 쪽은 "이 기기에 남은 임시 상태"다. 한 버튼으로 묶으면 다른 기기의 초안까지
// 지워진다고 오해하거나, 반대로 이 기기의 흔적이 남아 있는 줄 모르게 된다.
//
// 그래서 여기서는 이 기기에 있는 것만, 종류별로 골라 지운다.

export type CacheKind = 'drafts' | 'translations' | 'dismissed' | 'display';

export interface CacheGroup {
  kind: CacheKind;
  label: string;
  desc: string;
  /** 정확히 이 키 */
  keys?: string[];
  /** 이 접두사로 시작하는 모든 키 */
  prefixes?: string[];
}

export const CACHE_GROUPS: CacheGroup[] = [
  {
    kind: 'drafts',
    label: '작성 중이던 내용',
    desc: '커뮤니티 글 임시 저장, 문제별 코드·메모 자동 저장',
    keys: ['dc:community:draft'],
    prefixes: ['debate-code:'],
  },
  {
    kind: 'translations',
    label: '번역 캐시',
    desc: '한 번 번역한 문장을 다시 부르지 않으려고 저장해 둔 결과',
    prefixes: ['dc:tx:'],
  },
  {
    kind: 'dismissed',
    label: '다시 보지 않기 기록',
    desc: '닫아 둔 공지 팝업, 안내 배너, 워크스페이스 첫 안내',
    keys: [
      'dc-popup-hidden',
      'dc:tablet-notice-dismissed',
      'dc:workspace:onboarding-dismissed',
      'dc:workspace:onboarding-seen',
      'dc:ai-search:resume-dismissed',
    ],
  },
  {
    kind: 'display',
    label: '화면 설정',
    desc: '테마, 고대비, 움직임 줄이기, 낭독 속도, 접힌 메뉴 상태',
    keys: [
      'dc:theme',
      'dc-high-contrast',
      'dc-reduce-motion',
      'dc-tts-rate',
      'language',
      'dc:ws:header-pinned',
      'dc:debateai:suggestions-open',
      'dc.console.collapsedGroups',
    ],
  },
];

/** 종류별로 지금 몇 개가 남아 있는지 — 지우기 전에 "무엇이 지워지는지" 보여 준다 */
export function countLocalCache(): Record<CacheKind, number> {
  const out = { drafts: 0, translations: 0, dismissed: 0, display: 0 } as Record<CacheKind, number>;
  let all: string[];
  try {
    all = Object.keys(window.localStorage);
  } catch {
    // 스토리지가 막힌 환경 — 셀 것이 없다
    return out;
  }
  for (const group of CACHE_GROUPS) {
    out[group.kind] = all.filter(
      (k) =>
        group.keys?.includes(k) ||
        group.prefixes?.some((p) => k.startsWith(p)),
    ).length;
  }
  return out;
}

/**
 * 고른 종류를 지운다. 지운 개수를 돌려준다.
 *
 * 로그인 정보(쿠키)는 건드리지 않는다 — 여기서 로그아웃까지 되면
 * "캐시를 지웠더니 튕겼다"가 된다. 세션 정리는 보안 화면의 일이다.
 */
export function clearLocalCache(kinds: CacheKind[]): number {
  let removed = 0;
  let all: string[];
  try {
    all = Object.keys(window.localStorage);
  } catch {
    return 0;
  }
  for (const group of CACHE_GROUPS) {
    if (!kinds.includes(group.kind)) continue;
    for (const key of all) {
      if (group.keys?.includes(key) || group.prefixes?.some((p) => key.startsWith(p))) {
        try {
          window.localStorage.removeItem(key);
          removed += 1;
        } catch {
          // 한 키가 실패해도 나머지는 계속 지운다
        }
      }
    }
  }
  return removed;
}
