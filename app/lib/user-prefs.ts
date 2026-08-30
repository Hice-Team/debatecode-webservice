// 계정에 저장하는 취향 값 — 에디터 기본값, 알림 채널, 시간·지역 표기.
//
// DB에는 JSON 한 칸으로 들어간다. 그래서 "무엇이 들어 있어야 하는가"를 아는 곳이
// 여기 하나여야 한다. 읽는 쪽이 저마다 기본값을 적기 시작하면, 화면마다 다른 기본값이
// 생기고 그게 버그로 보이지 않는다.
//
// 모든 parse 함수는 **무엇이 들어와도 온전한 값을 돌려준다**. 저장된 JSON은 지난 버전의
// 모양일 수도 있고, 손으로 고쳐졌을 수도 있다. 화면이 그걸로 멈추면 안 된다.

/* ─────────────── 에디터 기본값 ─────────────── */

export interface EditorPrefs {
  fontSize: number;
  tabSize: number;
  fontFamily: EditorFontId;
  autocomplete: boolean;
  minimap: boolean;
  wordWrap: boolean;
}

export type EditorFontId = 'plex' | 'jetbrains' | 'system';

export const EDITOR_FONTS: { id: EditorFontId; label: string; stack: string }[] = [
  { id: 'plex', label: 'IBM Plex Mono (기본)', stack: "'IBM Plex Mono', ui-monospace, monospace" },
  { id: 'jetbrains', label: 'JetBrains Mono', stack: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace" },
  { id: 'system', label: '시스템 고정폭', stack: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
];

export const EDITOR_FONT_SIZES = [12, 13, 14, 15, 16, 18] as const;
export const EDITOR_TAB_SIZES = [2, 4, 8] as const;

export const EDITOR_DEFAULTS: EditorPrefs = {
  fontSize: 14,
  // 0은 "언어를 따른다"는 뜻이다 — 파이썬 4칸, 자바스크립트 2칸.
  // 언어마다 관행이 다른데 한 값으로 묶으면 둘 중 하나는 늘 어색해진다.
  tabSize: 0,
  fontFamily: 'plex',
  autocomplete: true,
  minimap: false,
  wordWrap: false,
};

function clampInt(value: unknown, allowed: readonly number[], fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return allowed.includes(n) ? n : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function parseEditorPrefs(raw: unknown): EditorPrefs {
  if (!raw || typeof raw !== 'object') return EDITOR_DEFAULTS;
  const o = raw as Record<string, unknown>;
  const font = EDITOR_FONTS.some((f) => f.id === o.fontFamily)
    ? (o.fontFamily as EditorFontId)
    : EDITOR_DEFAULTS.fontFamily;
  return {
    fontSize: clampInt(o.fontSize, EDITOR_FONT_SIZES, EDITOR_DEFAULTS.fontSize),
    tabSize: clampInt(o.tabSize, [0, ...EDITOR_TAB_SIZES], EDITOR_DEFAULTS.tabSize),
    fontFamily: font,
    autocomplete: asBool(o.autocomplete, EDITOR_DEFAULTS.autocomplete),
    minimap: asBool(o.minimap, EDITOR_DEFAULTS.minimap),
    wordWrap: asBool(o.wordWrap, EDITOR_DEFAULTS.wordWrap),
  };
}

export function editorFontStack(id: EditorFontId): string {
  return (EDITOR_FONTS.find((f) => f.id === id) ?? EDITOR_FONTS[0]).stack;
}

/* ─────────────── 알림 채널 ─────────────── */

export type NotifyChannel =
  | 'comment'
  | 'adopted'
  | 'mateApply'
  | 'mateResult'
  | 'points'
  | 'security'
  | 'marketing';

export interface NotifyChannelSpec {
  id: NotifyChannel;
  label: string;
  desc: string;
  /** 끌 수 없는 알림 — 계정을 지키는 데 필요한 것 */
  required?: boolean;
  /**
   * 이 알림이 이미 나가고 있는가.
   *
   * false인 채널은 발송 경로가 아직 없다. 그래도 화면에서 끄고 켤 수 있게 두는 이유는,
   * 나중에 켜졌을 때 "묻지도 않고 오기 시작한" 상황을 만들지 않기 위해서다.
   * 대신 준비 중임을 화면에 그대로 적는다 — 켜 두었는데 오지 않는 이유를 알 수 있어야 한다.
   */
  live?: boolean;
}

export const NOTIFY_CHANNELS: NotifyChannelSpec[] = [
  { id: 'comment', label: '내 글에 달린 답글', desc: '내가 쓴 글에 누군가 답할 때' },
  { id: 'adopted', label: '답글 채택', desc: '내 답글이 채택되었을 때' },
  { id: 'mateApply', label: '디베이트메이트 신청 접수', desc: '신청이 접수되었을 때' },
  { id: 'mateResult', label: '디베이트메이트 심사 결과', desc: '승인 또는 반려가 결정되었을 때' },
  { id: 'points', label: '포인트 변동', desc: '포인트가 지급되거나 사용되었을 때' },
  {
    id: 'security',
    label: '보안 알림',
    desc: '이메일 인증, 비밀번호 재설정처럼 계정을 지키는 데 필요한 알림',
    required: true,
    live: true,
  },
  { id: 'marketing', label: '소식·혜택 안내', desc: '새 기능과 이벤트 소식 (선택 수신)' },
];

export type NotifyPrefs = Record<NotifyChannel, boolean>;

export const NOTIFY_DEFAULTS: NotifyPrefs = {
  comment: true,
  adopted: true,
  mateApply: true,
  mateResult: true,
  points: true,
  security: true,
  marketing: false,
};

/**
 * 이 사람에게 이 종류의 알림을 보내도 되는가.
 *
 * 알림을 보내는 곳은 전부 이 함수를 지나야 한다. 각자 조건을 적기 시작하면
 * 어느 한 곳이 주 스위치를 빼먹고, 그 한 곳 때문에 "껐는데 온다"가 된다.
 */
export function shouldNotify(
  user: { emailNotifications: boolean; notifyPrefs?: unknown },
  channel: NotifyChannel,
): boolean {
  const spec = NOTIFY_CHANNELS.find((c) => c.id === channel);
  // 계정을 지키는 알림은 주 스위치보다 위에 있다 — 끌 수 있으면 지키지 못한다
  if (spec?.required) return true;
  if (!user.emailNotifications) return false;
  return parseNotifyPrefs(user.notifyPrefs)[channel];
}

export function parseNotifyPrefs(raw: unknown): NotifyPrefs {
  const out = { ...NOTIFY_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  for (const spec of NOTIFY_CHANNELS) {
    // 보안 알림은 저장된 값과 무관하게 항상 켜져 있다 — 끄는 길을 두지 않는다
    if (spec.required) continue;
    out[spec.id] = asBool(o[spec.id], NOTIFY_DEFAULTS[spec.id]);
  }
  return out;
}

/* ─────────────── 시간·지역 표기 ─────────────── */

export type DateFormatId = 'ymdDot' | 'ymdDash' | 'mdy' | 'dmy';

export const DATE_FORMATS: { id: DateFormatId; label: string; sample: string }[] = [
  { id: 'ymdDot', label: '2026. 8. 30.', sample: 'ko-KR' },
  { id: 'ymdDash', label: '2026-08-30', sample: 'ISO' },
  { id: 'mdy', label: 'Aug 30, 2026', sample: 'en-US' },
  { id: 'dmy', label: '30 Aug 2026', sample: 'en-GB' },
];

export const DEFAULT_DATE_FORMAT: DateFormatId = 'ymdDot';

export function isDateFormat(v: unknown): v is DateFormatId {
  return DATE_FORMATS.some((f) => f.id === v);
}

/**
 * 자주 쓰이는 시간대만 추린다.
 *
 * IANA 목록 전체는 600개가 넘는다. 그대로 내려 두면 고르는 것이 아니라 찾는 일이 된다.
 * "브라우저 시간대 따르기"가 기본이므로, 여기 없는 곳에 사는 사람도 손해 보지 않는다.
 */
export const TIMEZONES: { id: string; label: string }[] = [
  { id: 'Asia/Seoul', label: '서울 (UTC+9)' },
  { id: 'Asia/Tokyo', label: '도쿄 (UTC+9)' },
  { id: 'Asia/Shanghai', label: '상하이 (UTC+8)' },
  { id: 'Asia/Singapore', label: '싱가포르 (UTC+8)' },
  { id: 'Asia/Kolkata', label: '뉴델리 (UTC+5:30)' },
  { id: 'Europe/London', label: '런던 (UTC+0/+1)' },
  { id: 'Europe/Berlin', label: '베를린 (UTC+1/+2)' },
  { id: 'America/New_York', label: '뉴욕 (UTC-5/-4)' },
  { id: 'America/Chicago', label: '시카고 (UTC-6/-5)' },
  { id: 'America/Los_Angeles', label: '로스앤젤레스 (UTC-8/-7)' },
  { id: 'Australia/Sydney', label: '시드니 (UTC+10/+11)' },
  { id: 'UTC', label: 'UTC' },
];

export const COUNTRIES: { id: string; label: string }[] = [
  { id: 'KR', label: '대한민국' },
  { id: 'JP', label: '일본' },
  { id: 'CN', label: '중국' },
  { id: 'SG', label: '싱가포르' },
  { id: 'US', label: '미국' },
  { id: 'CA', label: '캐나다' },
  { id: 'GB', label: '영국' },
  { id: 'DE', label: '독일' },
  { id: 'FR', label: '프랑스' },
  { id: 'AU', label: '호주' },
  { id: 'IN', label: '인도' },
  { id: 'VN', label: '베트남' },
];

/* ─────────────── 개인 맞춤 ─────────────── */

export type ProfileVisibility = 'public' | 'members' | 'private';

// 설명은 **지금 실제로 달라지는 것**만 적는다.
// 아직 개인 프로필 페이지가 없으므로 "프로필을 볼 수 있다" 같은 말은 쓰지 않는다 —
// 없는 화면을 설명하는 설정은 켜 봐도 아무 일이 없고, 그게 가장 나쁜 종류의 거짓말이다.
export const PROFILE_VISIBILITY: { id: ProfileVisibility; label: string; desc: string }[] = [
  {
    id: 'public',
    label: '전체 공개',
    desc: '명예의 전당에 이름과 프로필 이미지가 그대로 오릅니다. 로그인하지 않은 방문자에게도 보입니다.',
  },
  {
    id: 'members',
    label: '회원 공개',
    desc: '로그인한 이용자에게만 이름이 보입니다. 로그인하지 않은 방문자에게는 익명 식별자로 표시됩니다.',
  },
  {
    id: 'private',
    label: '비공개',
    desc: '어디에서도 이름과 프로필 이미지를 쓰지 않습니다. 명예의 전당과 커뮤니티 모두 익명 식별자로 표시되며, 등급 배지도 함께 숨겨집니다.',
  },
];

export function isProfileVisibility(v: unknown): v is ProfileVisibility {
  return v === 'public' || v === 'members' || v === 'private';
}

export type ChatLanguage = 'auto' | 'ko' | 'en';

export const CHAT_LANGUAGES: { id: ChatLanguage; label: string; desc: string }[] = [
  { id: 'auto', label: '질문한 언어로', desc: '내가 쓴 언어에 맞춰 답합니다.' },
  { id: 'ko', label: '항상 한국어', desc: '영어로 물어도 한국어로 답합니다.' },
  { id: 'en', label: '항상 영어', desc: '한국어로 물어도 영어로 답합니다.' },
];

export function isChatLanguage(v: unknown): v is ChatLanguage {
  return v === 'auto' || v === 'ko' || v === 'en';
}

export const MAX_GOAL_LENGTH = 120;

/* ─────────────── AI 개인 설정 ─────────────── */

export const MAX_INSTRUCTIONS = 8;
export const MAX_INSTRUCTION_LENGTH = 200;

/**
 * 이용자가 적어 둔 지침을 온전한 목록으로 만든다.
 *
 * 저장된 값이 문자열 하나일 수도 있다(예전 모양). 그때는 한 줄짜리 목록으로 본다 —
 * 모양이 달라졌다고 해서 사람이 적어 둔 것을 버릴 이유는 없다.
 */
export function parseInstructions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  return list
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.slice(0, MAX_INSTRUCTION_LENGTH))
    .slice(0, MAX_INSTRUCTIONS);
}

export type ContextMode = 'full' | 'balanced' | 'lean';

export const CONTEXT_MODES: { id: ContextMode; label: string; desc: string; turns: number }[] = [
  {
    id: 'full',
    label: '넉넉히',
    desc: '앞선 대화를 최대한 함께 보냅니다. 맥락을 잘 잇지만 토큰을 가장 많이 씁니다.',
    turns: 20,
  },
  {
    id: 'balanced',
    label: '균형 (기본)',
    desc: '최근 대화 위주로 보냅니다. 대부분의 질문에는 이걸로 충분합니다.',
    turns: 8,
  },
  {
    id: 'lean',
    label: '아껴서',
    desc: '직전 몇 마디만 보냅니다. 한도를 오래 쓰고 싶을 때 고릅니다.',
    turns: 3,
  },
];

export const DEFAULT_CONTEXT_MODE: ContextMode = 'balanced';

export function isContextMode(v: unknown): v is ContextMode {
  return v === 'full' || v === 'balanced' || v === 'lean';
}

/** 이 모드에서 함께 보낼 지난 대화 수 */
export function contextTurns(mode: ContextMode): number {
  return (CONTEXT_MODES.find((m) => m.id === mode) ?? CONTEXT_MODES[1]).turns;
}
