'use client';

// 기기별 화면 설정 — 움직임 줄이기 · 낭독 속도.
//
// 계정이 아니라 브라우저에 저장한다. 이 값들은 "이 사람"이 아니라 "이 기기"의 사정이라서다.
// useSyncExternalStore로 읽어 첫 렌더부터 올바른 값이 나오게 한다(effect로 채우면
// 체크박스가 한 번 깜빡인다).
import { SPEECH_RATES, type SpeechRate } from './speech';

const MOTION_KEY = 'dc-reduce-motion';
const MOTION_EVENT = 'dc:reduce-motion';
const RATE_KEY = 'dc-tts-rate';
const RATE_EVENT = 'dc:tts-rate';

/* ---------- 움직임 줄이기 ---------- */

// 스냅샷은 같은 값을 돌려줘야 한다 — 매번 새로 만들면 무한 렌더가 된다
let motionSnapshot = false;

export function readReduceMotion(): boolean {
  try {
    motionSnapshot = window.localStorage.getItem(MOTION_KEY) === 'on';
  } catch {
    // 저장소를 못 읽으면 끈 상태로 둔다
  }
  return motionSnapshot;
}

export function subscribeReduceMotion(onChange: () => void): () => void {
  window.addEventListener(MOTION_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(MOTION_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * 켜고 끄기 — 저장 + html 속성 반영.
 *
 * CSS는 `:root[data-reduce-motion='on']`으로 이 속성을 본다(globals.css).
 * 클래스가 아니라 속성인 이유: 운영체제 설정(prefers-reduced-motion)과 같은 규칙 안에서
 * 나란히 쓰기 위해서다.
 */
export function setReduceMotion(on: boolean): void {
  motionSnapshot = on;
  try {
    window.localStorage.setItem(MOTION_KEY, on ? 'on' : 'off');
  } catch {
    // 저장하지 못해도 이번 세션에는 적용된다
  }
  document.documentElement.dataset.reduceMotion = on ? 'on' : 'off';
  window.dispatchEvent(new Event(MOTION_EVENT));
}

/** 첫 로드에 저장된 값을 html에 반영한다 — 레이아웃에서 한 번 호출한다. */
export function applyStoredReduceMotion(): void {
  document.documentElement.dataset.reduceMotion = readReduceMotion() ? 'on' : 'off';
}

/* ---------- 낭독 속도 ---------- */

// speech.ts와 같은 키를 쓴다 — 설정 화면에서 바꾸면 재생 중인 낭독도 따라간다
let rateSnapshot: SpeechRate = 1;

export function readSpeechRate(): SpeechRate {
  try {
    const raw = Number(window.localStorage.getItem(RATE_KEY));
    if ((SPEECH_RATES as readonly number[]).includes(raw)) rateSnapshot = raw as SpeechRate;
  } catch {
    // 기본 속도로 둔다
  }
  return rateSnapshot;
}

export function subscribeSpeechRate(onChange: () => void): () => void {
  window.addEventListener(RATE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(RATE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function setSpeechRate(rate: SpeechRate): void {
  rateSnapshot = rate;
  try {
    window.localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // 저장하지 못해도 이번 재생에는 적용된다
  }
  window.dispatchEvent(new Event(RATE_EVENT));
}

/* ---------- 고대비 ---------- */

const CONTRAST_KEY = 'dc-high-contrast';
const CONTRAST_EVENT = 'dc:high-contrast';

let contrastSnapshot = false;

export function readHighContrast(): boolean {
  try {
    contrastSnapshot = window.localStorage.getItem(CONTRAST_KEY) === 'on';
  } catch {
    // 저장소를 못 읽으면 끈 상태로 둔다
  }
  return contrastSnapshot;
}

export function subscribeHighContrast(onChange: () => void): () => void {
  window.addEventListener(CONTRAST_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CONTRAST_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * 고대비 켜기 — 명도 계단을 더 벌리고 경계선을 진하게 한다.
 *
 * 색상 자체를 바꾸지는 않는다. 의미색(성공·주의·위험)까지 흑백으로 만들면
 * "무엇이 실패했는지"를 색으로 읽던 사람이 오히려 못 읽는다.
 * 손대는 것은 회색 계단과 hairline뿐이다(globals.css의 [data-contrast='high']).
 */
export function setHighContrast(on: boolean): void {
  contrastSnapshot = on;
  try {
    window.localStorage.setItem(CONTRAST_KEY, on ? 'on' : 'off');
  } catch {
    // 저장하지 못해도 이번 세션에는 적용된다
  }
  document.documentElement.dataset.contrast = on ? 'high' : 'normal';
  window.dispatchEvent(new Event(CONTRAST_EVENT));
}

/** 첫 로드에 저장된 값을 html에 반영한다 — 테마 부트 스크립트가 함께 호출한다. */
export function applyStoredHighContrast(): void {
  document.documentElement.dataset.contrast = readHighContrast() ? 'high' : 'normal';
}
