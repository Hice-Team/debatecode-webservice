'use client';

// 낭독(TTS) — Web Speech API를 감싼 공용 훅.
//
// 왜 감싸는가. 화면 세 곳(AI Search 답변 · 문제 풀이 답안 · 면접 패널)이 각자
// `new SpeechSynthesisUtterance(...)` 한 줄로 처리하고 있었는데, 그 방식에는 브라우저
// 쪽 함정이 세 개 있다.
//
//   1) 크롬은 긴 문장 하나를 15초쯤 읽다가 말없이 끊는다. → 문장 단위로 잘라 이어 읽는다.
//   2) 크롬은 재생 중에도 일정 시간이 지나면 합성기를 재워 버린다. → 주기적으로 깨운다.
//   3) getVoices()는 처음 호출 때 비어 있을 수 있다. → voiceschanged를 기다린다.
//
// 그 밖에 일시정지·속도 조절처럼 "읽어 주는 기능"이라면 당연히 있어야 할 것들을 더했다.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** 한 번에 넘길 최대 길이 — 너무 길면 크롬이 중간에 끊는다. */
const CHUNK_MAX = 160;
/** 합성기가 잠들지 않게 깨우는 주기. */
const KEEPALIVE_MS = 10_000;
const RATE_KEY = 'dc-tts-rate';
const RATE_EVENT = 'dc:tts-rate';

export const SPEECH_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];

/** 낭독 전에 마크다운 기호를 걷어낸다 — 별표와 백틱을 그대로 읽으면 알아듣기 어렵다. */
export function stripMarkdownForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' 코드 블록 생략. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 문장 경계로 자른다.
 *
 * 글자 수로만 자르면 단어 한가운데서 끊겨 발음이 뭉개진다. 문장부호를 먼저 찾고,
 * 그래도 긴 문장은 쉼표에서, 그마저 없으면 어쩔 수 없이 길이로 자른다.
 */
export function chunkForSpeech(text: string): string[] {
  const sentences = text.match(/[^.!?。？！\n]+[.!?。？！]*\s*/g) ?? (text ? [text] : []);
  const chunks: string[] = [];
  let buffer = '';

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed) chunks.push(trimmed);
    buffer = '';
  };

  for (const sentence of sentences) {
    if (sentence.length > CHUNK_MAX) {
      flush();
      // 긴 문장 — 쉼표 단위로 한 번 더 쪼갠다
      let rest = sentence;
      while (rest.length > CHUNK_MAX) {
        const head = rest.slice(0, CHUNK_MAX);
        const cut = Math.max(head.lastIndexOf(','), head.lastIndexOf(' '));
        const at = cut > CHUNK_MAX * 0.4 ? cut + 1 : CHUNK_MAX;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at);
      }
      buffer = rest;
      continue;
    }
    if (buffer.length + sentence.length > CHUNK_MAX) flush();
    buffer += sentence;
  }
  flush();
  return chunks.filter(Boolean);
}

/** 요청한 언어에 가장 잘 맞는 목소리 — 없으면 브라우저 기본값에 맡긴다. */
function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const prefix = lang.slice(0, 2).toLowerCase();
  const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  if (matching.length === 0) return null;
  // 기기에 설치된 목소리가 네트워크 목소리보다 끊김이 적다
  return matching.find((v) => v.localService) ?? matching[0];
}

/* ---------- 지원 여부 · 재생 속도 (useSyncExternalStore) ----------
   effect에서 setState로 채우면 첫 렌더가 한 번 버려지고 화면이 깜빡인다.
   서버 스냅샷을 따로 주는 useSyncExternalStore가 하이드레이션 불일치 없이 첫 렌더에
   바로 값을 넣는다 — 이 저장소의 다른 화면(로그인·콘솔 사이드바)과 같은 방식이다. */

const noopSubscribe = () => () => {};

function readSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// 스냅샷은 같은 값을 돌려줘야 한다 — 매번 새로 만들면 무한 렌더가 된다.
let rateSnapshot: SpeechRate = 1;

function readRate(): SpeechRate {
  try {
    const raw = Number(window.localStorage.getItem(RATE_KEY));
    if ((SPEECH_RATES as readonly number[]).includes(raw)) rateSnapshot = raw as SpeechRate;
  } catch {
    // 저장소를 못 읽으면 기본 속도로 둔다
  }
  return rateSnapshot;
}

function subscribeRate(onChange: () => void): () => void {
  // 같은 탭의 변경(커스텀 이벤트)과 다른 탭의 변경(storage)을 모두 듣는다
  window.addEventListener(RATE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(RATE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export interface SpeechController {
  /** 브라우저가 낭독을 지원하는가 — 아니면 버튼 자체를 감춘다 */
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  rate: SpeechRate;
  /** 전체 조각 중 어디까지 읽었는가 (0~1) */
  progress: number;
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setRate: (rate: SpeechRate) => void;
}

/**
 * 낭독 컨트롤러.
 *
 * `language`는 앱의 표시 언어('ko' | 'en')를 그대로 받는다.
 */
export function useSpeech(language: string): SpeechController {
  const supported = useSyncExternalStore(noopSubscribe, readSupported, () => false);
  const rate = useSyncExternalStore(subscribeRate, readRate, () => 1 as SpeechRate);

  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const cursor = useRef(0);
  const voices = useRef<SpeechSynthesisVoice[]>([]);
  const keepalive = useRef<ReturnType<typeof setInterval> | null>(null);
  // 속도를 바꿨을 때 읽던 자리에서 이어 가려면 무엇을 읽던 중이었는지 남겨 둬야 한다
  const chunksRef = useRef<string[]>([]);
  const speakingRef = useRef(false);
  // 재생 세대 번호 — 취소된 utterance의 onend가 뒤늦게 와도 이 번호가 달라 무시된다
  const runId = useRef(0);

  const lang = language === 'en' ? 'en-US' : 'ko-KR';

  // 목소리 목록은 비동기로 채워진다 — 구독해 두고 ref에만 담는다(다시 그릴 이유가 없다).
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => {
      voices.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const clearKeepalive = useCallback(() => {
    if (keepalive.current) {
      clearInterval(keepalive.current);
      keepalive.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearKeepalive();
    runId.current += 1;
    speakingRef.current = false;
    cursor.current = 0;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setPaused(false);
    setProgress(0);
  }, [clearKeepalive]);

  // 화면을 떠날 때 낭독이 계속되지 않도록
  useEffect(
    () => () => {
      if (keepalive.current) clearInterval(keepalive.current);
      window.speechSynthesis?.cancel();
    },
    [],
  );

  const start = useCallback(
    (chunks: string[], from: number) => {
      const synth = window.speechSynthesis;
      if (!synth || chunks.length === 0) return;

      runId.current += 1;
      const id = runId.current;
      chunksRef.current = chunks;
      speakingRef.current = true;

      const playFrom = (index: number) => {
        if (id !== runId.current) return; // 이미 다른 재생으로 넘어갔다
        const text = chunks[index];
        if (text === undefined) {
          clearKeepalive();
          speakingRef.current = false;
          setSpeaking(false);
          setPaused(false);
          setProgress(1);
          return;
        }

        cursor.current = index;
        setProgress(index / chunks.length);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = rateSnapshot;
        const voice = pickVoice(voices.current, lang);
        if (voice) utterance.voice = voice;
        utterance.onend = () => playFrom(index + 1);
        // 취소로 생긴 error는 세대 번호가 달라져 무시된다
        utterance.onerror = () => playFrom(index + 1);
        synth.speak(utterance);
      };

      synth.cancel();
      setSpeaking(true);
      setPaused(false);

      clearKeepalive();
      // 크롬은 재생 중에도 합성기를 재운다 — 주기적으로 깨워 준다
      keepalive.current = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, KEEPALIVE_MS);

      playFrom(from);
    },
    [clearKeepalive, lang],
  );

  const speak = useCallback(
    (text: string) => {
      if (!('speechSynthesis' in window)) return;
      const chunks = chunkForSpeech(stripMarkdownForSpeech(text));
      if (chunks.length === 0) return;
      setProgress(0);
      start(chunks, 0);
    },
    [start],
  );

  const pause = useCallback(() => {
    window.speechSynthesis?.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis?.resume();
    setPaused(false);
  }, []);

  /** 속도 변경 — 재생 중이면 읽던 조각부터 새 속도로 이어 읽는다. */
  const setRate = useCallback((next: SpeechRate) => {
    rateSnapshot = next;
    try {
      window.localStorage.setItem(RATE_KEY, String(next));
    } catch {
      // 저장하지 못해도 이번 재생에는 적용된다
    }
    window.dispatchEvent(new Event(RATE_EVENT));
    // 재생 중이면 읽던 조각부터 새 속도로 다시 시작한다
    if (speakingRef.current) start(chunksRef.current, cursor.current);
  }, [start]);

  return { supported, speaking, paused, rate, progress, speak, pause, resume, stop, setRate };
}
