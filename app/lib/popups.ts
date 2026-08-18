// 공개 팝업 — 화면과 서버가 공유하는 타입·링크 해석.
//
// 링크 해석을 한곳에 둔 이유: 콘솔 미리보기와 실제 팝업이 같은 규칙으로 URL을 만들어야
// "관리자 화면에서는 되는데 실제로는 안 가는" 링크가 생기지 않는다.

export type PopupLinkType = 'none' | 'post' | 'url' | 'mail';

export const POPUP_LINK_LABELS: Record<PopupLinkType, string> = {
  none: '버튼 없음',
  post: '커뮤니티 글로 이동',
  url: '외부 링크로 이동',
  mail: '문의 메일 보내기',
};

export const POPUP_LINK_HINTS: Record<PopupLinkType, string> = {
  none: '닫기 버튼만 있습니다.',
  post: '커뮤니티 게시글 ID를 입력하세요. 주소창의 /community/<여기> 부분입니다.',
  url: 'https:// 로 시작하는 전체 주소를 입력하세요.',
  mail: '문의를 받을 이메일 주소를 입력하세요.',
};

export const DEFAULT_LINK_LABEL: Record<PopupLinkType, string> = {
  none: '',
  post: '자세히 보기',
  url: '바로가기',
  mail: '문의하기',
};

export interface PopupLink {
  href: string;
  label: string;
  /** 외부로 나가는 링크인지 — 새 탭으로 열고 rel을 붙인다 */
  external: boolean;
}

/**
 * 팝업/배너의 클릭 동작을 실제 href로 바꾼다.
 * 대상이 비었거나 형식이 이상하면 null — 깨진 버튼을 그리지 않는다.
 */
export function resolvePopupLink(
  linkType: string | null | undefined,
  target: string | null | undefined,
  label?: string | null,
): PopupLink | null {
  const type = (linkType ?? 'none') as PopupLinkType;
  const value = (target ?? '').trim();
  if (type === 'none' || !value) return null;

  const text = (label ?? '').trim() || DEFAULT_LINK_LABEL[type] || '바로가기';

  if (type === 'post') {
    // 사용자가 전체 URL을 붙여 넣었을 수도 있다 — 마지막 경로 조각을 ID로 본다
    const id = value.includes('/') ? value.replace(/\/+$/, '').split('/').pop()! : value;
    return { href: `/community/${id}`, label: text, external: false };
  }

  if (type === 'mail') {
    if (!value.includes('@')) return null;
    return { href: `mailto:${value}`, label: text, external: true };
  }

  // url — http(s)만 허용한다. javascript: 같은 스킴이 들어오면 버린다.
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { href: url.toString(), label: text, external: true };
  } catch {
    return null;
  }
}

/** 게시 기간 판정 — 시작 전이거나 종료된 팝업은 띄우지 않는다. */
export function isLive(
  item: { active: boolean; startsAt: Date | null; endsAt: Date | null },
  at: Date,
): boolean {
  if (!item.active) return false;
  if (item.startsAt && item.startsAt > at) return false;
  if (item.endsAt && item.endsAt < at) return false;
  return true;
}
