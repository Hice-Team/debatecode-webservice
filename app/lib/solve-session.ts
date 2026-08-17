// 문제 풀이 사전 설정(pre-solve setup).
//
// 실전 모의고사는 "어떤 조건에서 풀 것인지"를 먼저 정하고 들어간다. 시간 규칙(자유/엄격),
// 풀이 모드(시그니처/디베이트/리팩토링), 시작 코드 난이도를 입장 전에 한 번 고르고 나면
// 풀이 중에는 바꿀 수 없다 — 막히면 난이도를 내리고 AI를 켤 수 있는 시험은 실전이 아니다.
//
// 고른 설정은 문제별로 localStorage에 남는다. 새로고침해도 게이트가 다시 뜨지 않고,
// 경과 시간(startedAt)도 이어진다.
import type { ScaffoldLevel } from './scaffold';

/** 시간 규칙 — free는 스톱워치(경과), strict는 카운트다운(제한) */
export type TimerMode = 'free' | 'strict';
export type WorkspaceMode = 'signature' | 'debate' | 'refactor';
/** 리팩토링모드의 세부 모드 — copilot은 AI 프롬프트로만, editor는 직접 수정 */
export type RefactorMode = 'copilot' | 'editor';

export const TIMER_MODES: TimerMode[] = ['free', 'strict'];
export const WORKSPACE_MODES: WorkspaceMode[] = ['signature', 'debate', 'refactor'];

/** 엄격모드 제한 시간 선택지(분) */
export const STRICT_LIMIT_CHOICES = [15, 30, 45, 60, 90];
export const DEFAULT_STRICT_LIMIT = 30;

export interface SolveSetup {
  timerMode: TimerMode;
  mode: WorkspaceMode;
  refactorMode: RefactorMode;
  level: ScaffoldLevel;
  /** 엄격모드 제한 시간(분) — 자유모드에서는 쓰이지 않는다 */
  limitMinutes: number;
  /** 입장 시각(ms epoch) — 새로고침해도 타이머가 이어지도록 저장한다 */
  startedAt: number;
}

// ---------- 비로그인 제약 ----------
// 비로그인 이용자는 시그니처모드 · 보통 난이도만 쓸 수 있다.
// 디베이트(면접 세션)와 리팩토링(결함 코드 생성)은 서버에 세션을 만들어야 하고,
// 쉬움 난이도는 debateAI 호출이 전제라 계정 없이는 열 수 없기 때문이다.
export const GUEST_MODE: WorkspaceMode = 'signature';
export const GUEST_LEVEL: ScaffoldLevel = 'normal';

export function allowedModes(isLoggedIn: boolean): WorkspaceMode[] {
  return isLoggedIn ? WORKSPACE_MODES : [GUEST_MODE];
}

export function allowedLevels(isLoggedIn: boolean): ScaffoldLevel[] {
  return isLoggedIn ? (['easy', 'normal', 'hard'] as ScaffoldLevel[]) : [GUEST_LEVEL];
}

/** 로그인 상태에서 이 설정이 유효한가 — 저장된 설정을 되살릴 때도 같은 기준으로 거른다. */
export function isSetupAllowed(setup: SolveSetup, isLoggedIn: boolean): boolean {
  return allowedModes(isLoggedIn).includes(setup.mode) && allowedLevels(isLoggedIn).includes(setup.level);
}

/** 게이트가 처음 열릴 때의 기본 선택 — 누구나 고를 수 있는 조합에서 출발한다. */
export function defaultSetup(): Omit<SolveSetup, 'startedAt'> {
  return {
    timerMode: 'free',
    mode: GUEST_MODE,
    refactorMode: 'copilot',
    level: GUEST_LEVEL,
    limitMinutes: DEFAULT_STRICT_LIMIT,
  };
}

// ---------- 저장 ----------
function storageKey(problemId: number): string {
  return `dc:ws:setup:${problemId}`;
}

/**
 * 저장된 설정을 읽는다. 형식이 깨졌거나 지금 로그인 상태에서 쓸 수 없는 설정이면
 * null을 돌려 게이트를 다시 띄운다(예: 로그아웃 후 돌아온 디베이트모드 세션).
 */
export function readSetup(problemId: number, isLoggedIn: boolean): SolveSetup | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(problemId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SolveSetup>;
    if (
      !parsed ||
      !TIMER_MODES.includes(parsed.timerMode as TimerMode) ||
      !WORKSPACE_MODES.includes(parsed.mode as WorkspaceMode) ||
      typeof parsed.startedAt !== 'number'
    ) {
      return null;
    }
    const setup: SolveSetup = {
      timerMode: parsed.timerMode as TimerMode,
      mode: parsed.mode as WorkspaceMode,
      refactorMode: parsed.refactorMode === 'editor' ? 'editor' : 'copilot',
      level: (parsed.level ?? GUEST_LEVEL) as ScaffoldLevel,
      limitMinutes: typeof parsed.limitMinutes === 'number' ? parsed.limitMinutes : DEFAULT_STRICT_LIMIT,
      startedAt: parsed.startedAt,
    };
    return isSetupAllowed(setup, isLoggedIn) ? setup : null;
  } catch {
    return null;
  }
}

export function writeSetup(problemId: number, setup: SolveSetup): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(problemId), JSON.stringify(setup));
  } catch {
    // 저장 실패는 치명적이지 않다 — 이번 세션 동안은 메모리 상태로 진행된다
  }
}

export function clearSetup(problemId: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(problemId));
  } catch {
    // ignore
  }
}

// ---------- 재진입 판별 ----------
//
// "새로고침"과 "나갔다 다시 들어옴"을 갈라야 재진입 팝업이 성가시지 않다.
// 탭 단위 sessionStorage에 표식을 남기고, 화면을 떠날 때(언마운트) 지운다.
//   새로고침    → 언마운트 정리가 돌지 않아 표식이 남는다 → 그대로 이어서
//   다른 페이지로 갔다가 복귀 → 표식이 지워져 있다 → 이어서 풀지 새로 시작할지 묻는다
function liveKey(problemId: number): string {
  return `dc:ws:live:${problemId}`;
}

export function markLive(problemId: number, startedAt: number): void {
  try {
    window.sessionStorage.setItem(liveKey(problemId), String(startedAt));
  } catch {
    // 표식이 없으면 재진입으로 보게 될 뿐, 진행에는 지장이 없다
  }
}

export function clearLive(problemId: number): void {
  try {
    window.sessionStorage.removeItem(liveKey(problemId));
  } catch {
    // ignore
  }
}

/** 이 탭에서 방금까지 보고 있던 그 세션인가. */
export function isLiveInTab(problemId: number, startedAt: number): boolean {
  try {
    return window.sessionStorage.getItem(liveKey(problemId)) === String(startedAt);
  } catch {
    return false;
  }
}

// ---------- 시간 ----------
export function elapsedMs(setup: SolveSetup, now = Date.now()): number {
  return Math.max(0, now - setup.startedAt);
}

/** 엄격모드의 남은 시간(ms). 자유모드에서는 null. */
export function remainingMs(setup: SolveSetup, now = Date.now()): number | null {
  if (setup.timerMode !== 'strict') return null;
  return Math.max(0, setup.limitMinutes * 60_000 - elapsedMs(setup, now));
}

/** mm:ss (1시간을 넘으면 h:mm:ss) */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
