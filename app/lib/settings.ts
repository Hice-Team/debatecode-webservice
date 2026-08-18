// 런타임 설정 — 배포된 코드를 고치지 않고 바꿀 수 있는 값.
//
// 배포 후 문제가 생겼을 때 선택지가 "코드 고치고 재배포" 하나뿐이면, 리눅스 러너에서
// 빌드가 도는 몇 분 동안 장애가 그대로 이어진다. 스팸이 쏟아지거나 외부 AI가 죽었을 때
// 필요한 건 새 코드가 아니라 **스위치**다.
//
// 설계 원칙:
//   · 스키마(어떤 키가 있고 기본값이 뭔지)는 이 파일이 원본이다. DB에는 기본값에서
//     벗어난 값만 들어온다. 그래서 AppSetting 표가 비어 있어도, 심지어 조회가 실패해도
//     앱은 코드 기본값으로 정상 동작한다 — 설정 계층이 새 단일 장애점이 되면 안 된다.
//   · 요청당 1회만 읽는다(React cache). 플래그를 여러 곳에서 확인해도 쿼리는 하나다.
import { cache } from 'react';
import { prisma } from './prisma';

export type SettingCategory = 'flag' | 'limit' | 'content' | 'integration' | 'maintenance';
export type SettingValueType = 'boolean' | 'number' | 'string' | 'text' | 'enum';

export interface SettingDef {
  key: string;
  category: SettingCategory;
  valueType: SettingValueType;
  label: string;
  description: string;
  default: boolean | number | string;
  /** valueType='enum'일 때 선택지 */
  options?: { value: string; label: string }[];
  /** valueType='number'일 때 입력 범위 */
  min?: number;
  max?: number;
  /** 켜고 끌 때 파급이 큰 설정 — 화면에서 경고를 띄운다 */
  danger?: boolean;
}

export const SETTING_DEFS = [
  /* ---------- 유지보수 ---------- */
  {
    key: 'maintenance.enabled',
    category: 'maintenance',
    valueType: 'boolean',
    label: '유지보수 모드',
    description: '일반 이용자에게 점검 안내 화면만 보여 준다. 콘솔 권한 계정은 그대로 접속된다.',
    default: false,
    danger: true,
  },
  {
    key: 'maintenance.message',
    category: 'maintenance',
    valueType: 'text',
    label: '점검 안내 문구',
    description: '점검 화면에 표시할 내용. 언제 끝나는지를 함께 적어 주는 편이 문의를 줄인다.',
    default: '서비스 점검 중입니다. 잠시 후 다시 이용해 주세요.',
  },
  {
    key: 'maintenance.eta',
    category: 'maintenance',
    valueType: 'string',
    label: '예상 종료 시각',
    description: '예: 2026-08-18 15:00 KST. 비우면 표시하지 않는다.',
    default: '',
  },

  /* ---------- 기능 플래그 (킬 스위치) ---------- */
  {
    key: 'flag.signup',
    category: 'flag',
    valueType: 'boolean',
    label: '회원가입',
    description: '끄면 신규 가입이 막힌다. 가입 스팸이 쏟아질 때 쓴다.',
    default: true,
    danger: true,
  },
  {
    key: 'flag.community_write',
    category: 'flag',
    valueType: 'boolean',
    label: '커뮤니티 글·답글 작성',
    description: '끄면 읽기는 되고 쓰기만 막힌다. 어뷰징 대응용.',
    default: true,
    danger: true,
  },
  {
    key: 'flag.attachment_upload',
    category: 'flag',
    valueType: 'boolean',
    label: '첨부 업로드',
    description: 'Storage 장애나 악성 파일 유입 시 끈다.',
    default: true,
  },
  {
    key: 'flag.ai_search',
    category: 'flag',
    valueType: 'boolean',
    label: 'AI Search',
    description: '끄면 AI Search 진입이 막힌다.',
    default: true,
  },
  {
    key: 'flag.interview',
    category: 'flag',
    valueType: 'boolean',
    label: 'AI 면접',
    description: '끄면 새 면접 세션을 시작할 수 없다. 진행 중 세션은 유지된다.',
    default: true,
  },
  {
    key: 'flag.debateq',
    category: 'flag',
    valueType: 'boolean',
    label: 'debateQ / 리팩토링 모드',
    description: '끄면 새 debateQ 세션 생성이 막힌다.',
    default: true,
  },
  {
    key: 'flag.shop_order',
    category: 'flag',
    valueType: 'boolean',
    label: '디베이트샵 주문',
    description: '기프티콘 발급 채널 장애 시 끈다. 포인트 차감 후 발급 실패를 막는다.',
    default: true,
    danger: true,
  },
  {
    key: 'flag.problem_draft',
    category: 'flag',
    valueType: 'boolean',
    label: '문제 초안 제출',
    description: '검토 인력이 부족해 큐가 밀릴 때 잠시 닫는다.',
    default: true,
  },
  {
    key: 'flag.mate_application',
    category: 'flag',
    valueType: 'boolean',
    label: '디베이트메이트 신청',
    description: '모집을 닫을 때 끈다.',
    default: true,
  },

  /* ---------- 한도 ---------- */
  {
    key: 'limit.rate.ai_ask',
    category: 'limit',
    valueType: 'number',
    label: 'AI 질의 — 분당 허용 횟수',
    description: '사용자 1인당. 낮출수록 남용이 줄고 비용이 준다.',
    default: 20,
    min: 1,
    max: 300,
  },
  {
    key: 'limit.rate.submission',
    category: 'limit',
    valueType: 'number',
    label: '코드 제출 — 분당 허용 횟수',
    description: '사용자 1인당.',
    default: 30,
    min: 1,
    max: 300,
  },
  {
    key: 'limit.rate.post',
    category: 'limit',
    valueType: 'number',
    label: '글·답글 작성 — 분당 허용 횟수',
    description: '도배 대응. 스팸이 들어오면 1~2로 낮춘다.',
    default: 10,
    min: 1,
    max: 120,
  },
  {
    key: 'limit.upload_mb',
    category: 'limit',
    valueType: 'number',
    label: '첨부 1건 최대 크기 (MB)',
    description: 'next.config.ts의 서버 액션 상한(25MB)을 넘길 수는 없다.',
    default: 10,
    min: 1,
    max: 25,
  },
  {
    key: 'limit.free_tokens_daily',
    category: 'limit',
    valueType: 'number',
    label: 'Debate Free AI 일일 토큰',
    description: '사용자 1인당. 업스트림 비용이 튀면 낮춘다.',
    default: 100000,
    min: 1000,
    max: 1000000,
  },

  /* ---------- 연동 ---------- */
  {
    key: 'integration.free_ai_family',
    category: 'integration',
    valueType: 'enum',
    label: 'Debate Free AI 우선 계열',
    description:
      '한 공급자가 장애일 때 다른 곳으로 돌린다. auto는 키가 꽂힌 것 중 카탈로그 순서대로 고른다.',
    default: 'auto',
    options: [
      { value: 'auto', label: '자동 (키 있는 것 중 우선순위대로)' },
      { value: 'gemma', label: 'Google AI (Gemma)' },
      { value: 'groq', label: 'Groq' },
      { value: 'grok', label: 'xAI Grok' },
      { value: 'hf', label: 'Hugging Face' },
    ],
  },
  {
    key: 'integration.free_ai_enabled',
    category: 'integration',
    valueType: 'boolean',
    label: 'Debate Free AI 실모델 사용',
    description: '끄면 규칙 기반 폴백만 쓴다. 업스트림 전면 장애나 비용 급증 시.',
    default: true,
  },
  {
    key: 'integration.email_enabled',
    category: 'integration',
    valueType: 'boolean',
    label: '메일 발송',
    description: '끄면 모든 발송이 dry-run으로 기록만 남는다. 잘못된 대량 발송을 막을 때.',
    default: true,
    danger: true,
  },

  /* ---------- 콘텐츠 ---------- */
  {
    key: 'content.banner_text',
    category: 'content',
    valueType: 'text',
    label: '전역 안내 배너',
    description: '비우면 표시하지 않는다. 공지 팝업보다 가벼운, 상시 노출용 한 줄.',
    default: '',
  },
  {
    key: 'content.banner_tone',
    category: 'content',
    valueType: 'enum',
    label: '배너 톤',
    description: '배너의 색. 장애 공지는 경고, 안내는 정보로.',
    default: 'info',
    options: [
      { value: 'info', label: '정보 (파랑)' },
      { value: 'warn', label: '주의 (노랑)' },
      { value: 'alert', label: '경고 (빨강)' },
    ],
  },
  {
    key: 'content.banner_action_type',
    category: 'content',
    valueType: 'enum',
    label: '배너 버튼 동작',
    description: '배너 오른쪽에 붙는 버튼. 배너 문구가 비어 있으면 버튼도 표시되지 않는다.',
    default: 'none',
    options: [
      { value: 'none', label: '버튼 없음' },
      { value: 'post', label: '커뮤니티 글로 이동' },
      { value: 'url', label: '외부 링크로 이동' },
      { value: 'popup', label: '팝업 열기' },
      { value: 'mail', label: '문의 메일 보내기' },
    ],
  },
  {
    key: 'content.banner_action_target',
    category: 'content',
    valueType: 'string',
    label: '배너 버튼 대상',
    description:
      '커뮤니티 글이면 게시글 ID, 링크면 전체 주소(https://…), 팝업이면 팝업 ID, 메일이면 이메일 주소.',
    default: '',
  },
  {
    key: 'content.banner_action_label',
    category: 'content',
    valueType: 'string',
    label: '배너 버튼 문구',
    description: '비우면 동작에 맞는 기본 문구가 쓰인다.',
    default: '',
  },
  {
    key: 'content.support_email',
    category: 'content',
    valueType: 'string',
    label: '문의 회신 주소',
    description: '문의 답변 메일의 회신 주소로 쓴다.',
    default: '',
  },
] as const satisfies readonly SettingDef[];

export type SettingKey = (typeof SETTING_DEFS)[number]['key'];

const DEF_BY_KEY = new Map<string, SettingDef>(SETTING_DEFS.map((d) => [d.key, d as SettingDef]));

export function settingDef(key: string): SettingDef | undefined {
  return DEF_BY_KEY.get(key);
}

export const SETTING_CATEGORY_LABELS: Record<SettingCategory, string> = {
  maintenance: '유지보수',
  flag: '기능 플래그',
  limit: '한도',
  integration: '연동',
  content: '콘텐츠',
};

/* ---------- 읽기 ---------- */

/**
 * DB에 저장된 오버라이드 전체. 요청당 1회만 조회한다.
 * 조회가 실패하면 빈 맵을 돌려준다 — 이 계층이 죽어도 앱은 코드 기본값으로 돌아야 한다.
 */
const loadOverrides = cache(async (): Promise<Map<string, unknown>> => {
  try {
    const rows = await prisma.appSetting.findMany({ select: { key: true, value: true } });
    return new Map(rows.map((r) => [r.key, r.value]));
  } catch {
    return new Map();
  }
});

/** 설정 값 하나. 타입이 정의와 어긋나면 기본값으로 떨어진다. */
export async function getSetting<T extends boolean | number | string>(key: SettingKey): Promise<T> {
  const def = DEF_BY_KEY.get(key);
  if (!def) throw new Error(`알 수 없는 설정 키: ${key}`);

  const overrides = await loadOverrides();
  if (!overrides.has(key)) return def.default as T;

  const raw = overrides.get(key);
  const expected = def.valueType === 'text' || def.valueType === 'enum' ? 'string' : def.valueType;
  // DB 값이 손상됐거나 정의가 바뀌어 타입이 안 맞으면 기본값을 쓴다
  if (typeof raw !== expected) return def.default as T;
  return raw as T;
}

/** 기능 플래그 — 켜져 있는가. */
export async function isEnabled(key: SettingKey): Promise<boolean> {
  return getSetting<boolean>(key);
}

/** 숫자 한도. */
export async function getLimit(key: SettingKey): Promise<number> {
  return getSetting<number>(key);
}

/** 카테고리별 현재 값 — 설정 화면이 표를 그릴 때 쓴다. */
export async function getSettingsByCategory(
  category: SettingCategory,
): Promise<Array<{ def: SettingDef; value: boolean | number | string; overridden: boolean }>> {
  const overrides = await loadOverrides();
  return SETTING_DEFS.filter((d) => d.category === category).map((d) => {
    const def = d as SettingDef;
    const has = overrides.has(def.key);
    const raw = overrides.get(def.key);
    const expected = def.valueType === 'text' || def.valueType === 'enum' ? 'string' : def.valueType;
    const valid = has && typeof raw === expected;
    return {
      def,
      value: valid ? (raw as boolean | number | string) : def.default,
      overridden: valid,
    };
  });
}

/* ---------- 기능 게이트 ---------- */

/**
 * 기능이 꺼져 있으면 던진다 — 라우트 핸들러처럼 예외로 끝내도 되는 곳에서 쓴다.
 * 메시지는 사용자에게 그대로 보인다.
 */
export async function assertEnabled(key: SettingKey, userMessage?: string): Promise<void> {
  const blocked = await featureBlockMessage(key, userMessage);
  if (blocked) throw new Error(blocked);
}

/**
 * 기능이 꺼져 있으면 안내 문구를, 켜져 있으면 null을 돌려준다.
 *
 * 폼을 다루는 서버 액션은 예외를 던지는 대신 `{ errors: { form: [메시지] } }`를 돌려주는
 * 것이 이 코드베이스의 관례다(app/lib/moderation.ts의 sanctionMessage와 같은 모양).
 * 사용자가 쓰던 입력을 잃지 않게 하기 위해서다.
 */
export async function featureBlockMessage(
  key: SettingKey,
  userMessage?: string,
): Promise<string | null> {
  if (await isEnabled(key)) return null;
  const def = DEF_BY_KEY.get(key);
  return userMessage ?? `${def?.label ?? '이 기능'}은(는) 현재 일시 중지되었습니다. 잠시 후 다시 시도해 주세요.`;
}

/**
 * 점검 중인가 — 콘솔 권한 계정은 통과시킨다.
 * 레이아웃/라우트가 이 값을 보고 점검 화면으로 돌린다.
 */
export async function maintenanceState(): Promise<{
  enabled: boolean;
  message: string;
  eta: string;
}> {
  const [enabled, message, eta] = await Promise.all([
    getSetting<boolean>('maintenance.enabled'),
    getSetting<string>('maintenance.message'),
    getSetting<string>('maintenance.eta'),
  ]);
  return { enabled, message, eta };
}
