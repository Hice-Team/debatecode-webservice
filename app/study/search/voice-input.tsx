'use client';

// 음성 입력 — 마이크 버튼 · 실시간 이퀄라이저 · 받아쓰기.
//
// 두 가지를 동시에 돌린다.
//   ① Web Speech API      말을 글자로 옮긴다(받아쓰기).
//   ② AnalyserNode        같은 마이크 스트림의 주파수 세기를 읽어 막대를 움직인다.
// 막대는 60fps로 다시 그려야 해서 state 대신 ref로 DOM을 직접 만진다
// (state로 돌리면 입력창 전체가 매 프레임 리렌더된다).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const BAR_COUNT = 28;

/* eslint-disable @typescript-eslint/no-explicit-any -- SpeechRecognition은 표준 타입 선언이 없다 */
type Recognition = any;

function getRecognitionCtor(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

/** 지원 여부는 한 번 정해지면 바뀌지 않으므로 구독할 것이 없다. */
const subscribeNothing = () => () => {};
const getSpeechSupported = () => !!getRecognitionCtor() && !!navigator.mediaDevices;

/** 브라우저 마이크 권한 상태 — 아직 확인 전이면 'unknown'. */
export type MicPermission = 'unknown' | 'prompt' | 'granted' | 'denied';

/** 한 번 설명을 읽고 동의했으면 다음부터는 브라우저 권한창만 뜨게 한다. */
const CONSENT_KEY = 'dc:ai-search:voice-consent';

export interface VoiceState {
  supported: boolean;
  listening: boolean;
  /** 아직 확정되지 않은 인식 결과 — 회색으로 흐리게 보여준다 */
  interim: string;
  /** 확정된 문장들 */
  transcript: string;
  error: string | null;
  permission: MicPermission;
  /** 마이크 사용 안내를 띄워야 하는 상태 — VoiceConsentDialog로 그린다 */
  askingConsent: boolean;
  acceptConsent: () => void;
  declineConsent: () => void;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  analyser: React.RefObject<AnalyserNode | null>;
}

/**
 * 마이크를 켜고 받아쓰기 결과를 흘려준다.
 * `onCommit`은 문장이 확정될 때마다 호출되며, 입력창에 그대로 이어 붙이면 된다.
 */
export function useVoiceInput({
  lang,
  onCommit,
}: {
  lang: string;
  onCommit: (text: string) => void;
}): VoiceState {
  // 브라우저 지원 여부는 렌더 중에 알 수 없다(서버에는 window가 없다).
  // 구독할 대상이 없는 값이라 useSyncExternalStore로 서버(false)/클라이언트 스냅샷만 구분해 읽는다.
  const supported = useSyncExternalStore(subscribeNothing, getSpeechSupported, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<MicPermission>('unknown');
  const [askingConsent, setAskingConsent] = useState(false);

  const recognitionRef = useRef<Recognition>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const stoppingRef = useRef(false);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const teardownAudio = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {
      // 이미 멈춘 경우
    }
    recognitionRef.current = null;
    teardownAudio();
    setListening(false);
    setInterim('');
  }, [teardownAudio]);

  const start = useCallback(async () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('이 브라우저는 음성 입력을 지원하지 않습니다.');
      return;
    }
    setError(null);
    setTranscript('');
    setInterim('');
    stoppingRef.current = false;

    // 마이크 권한 요청 — 거부되면 받아쓰기도 파형도 시작하지 않는다.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermission('granted');
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermission('denied');
        setError('마이크 사용이 거부되었습니다. 브라우저 주소창의 자물쇠 아이콘에서 마이크를 허용해 주세요.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('사용할 수 있는 마이크를 찾지 못했습니다.');
      } else {
        setError('마이크를 열지 못했습니다.');
      }
      return;
    }

    // 이퀄라이저 — 권한을 얻은 뒤 붙인다.
    //
    // 여기서 두 가지가 어긋나기 쉽다.
    //  ① getUserMedia를 await한 뒤라 사용자 제스처가 이미 소진돼 AudioContext가
    //     'suspended'로 태어난다. resume하지 않으면 주파수 데이터가 계속 0이라
    //     막대가 아예 움직이지 않는다.
    //  ② 파형은 부가 기능이므로, 실패하더라도 받아쓰기는 계속돼야 한다.
    try {
      const ctx = new (window.AudioContext ?? (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.75;
      ctx.createMediaStreamSource(streamRef.current).connect(analyser);
      analyserRef.current = analyser;
    } catch {
      analyserRef.current = null; // 파형 없이 받아쓰기만 진행한다
    }

    const recognition: Recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          const clean = text.trim();
          if (clean) {
            setTranscript((prev) => (prev ? `${prev} ${clean}` : clean));
            onCommitRef.current(clean);
          }
        } else {
          pending += text;
        }
      }
      setInterim(pending);
    };

    recognition.onerror = (event: any) => {
      // no-speech/aborted는 정상 흐름에서도 자주 나온다 — 알릴 일이 아니다
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      if (event.error === 'audio-capture') {
        // 인식 엔진이 마이크를 잡지 못하는 경우가 있다(파형용 스트림과 경합).
        // 파형을 포기하고 마이크를 넘겨 받아쓰기를 살린다.
        teardownAudio();
        setError('마이크를 다시 잡는 중입니다. 잠시 후에도 인식되지 않으면 버튼을 다시 눌러 주세요.');
        return;
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setPermission('denied');
        setError('마이크 사용이 차단되어 있습니다. 주소창의 자물쇠 아이콘에서 허용해 주세요.');
        return;
      }
      if (event.error === 'network') {
        setError('음성 인식 서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.');
        return;
      }
      setError('음성을 인식하지 못했습니다.');
    };

    // 브라우저가 침묵을 이유로 끊으면 사용자가 멈추기 전까지 다시 잇는다
    recognition.onend = () => {
      if (stoppingRef.current) return;
      try {
        recognition.start();
      } catch {
        setListening(false);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setError('음성 인식을 시작하지 못했습니다.');
      teardownAudio();
    }
  }, [lang, teardownAudio]);

  /**
   * 마이크 버튼 — 처음 쓰는 사람에게는 브라우저 권한 창을 바로 띄우지 않고
   * "무엇이 어디로 가는지" 먼저 알린다. 한 번 동의하면 다음부터는 곧바로 시작한다.
   */
  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }
    let agreed = false;
    try {
      agreed = window.localStorage.getItem(CONSENT_KEY) === 'yes';
    } catch {
      agreed = false;
    }
    if (agreed) void start();
    else setAskingConsent(true);
  }, [listening, start, stop]);

  const acceptConsent = useCallback(() => {
    try {
      window.localStorage.setItem(CONSENT_KEY, 'yes');
    } catch {
      // 저장 실패는 무시한다 — 다음에 다시 물으면 그만이다
    }
    setAskingConsent(false);
    void start();
  }, [start]);

  const declineConsent = useCallback(() => setAskingConsent(false), []);

  // 화면을 떠날 때 마이크가 켜진 채 남지 않도록
  useEffect(() => () => stop(), [stop]);

  return {
    supported,
    listening,
    interim,
    transcript,
    error,
    permission,
    askingConsent,
    acceptConsent,
    declineConsent,
    start,
    stop,
    toggle,
    analyser: analyserRef,
  };
}

/**
 * 마이크 사용 안내 — 브라우저 권한 창이 뜨기 전에 한 번 보여준다.
 * 음성이 어디로 가고 무엇이 저장되지 않는지 밝히는 것이 이 화면의 목적이다.
 */
export function VoiceConsentDialog({
  open,
  onAccept,
  onDecline,
  permission,
  strings,
}: {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
  permission: MicPermission;
  strings: {
    title: string;
    body: string;
    browserNote: string;
    noStore: string;
    denied: string;
    allow: string;
    cancel: string;
  };
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="voice-consent-title">
      <button type="button" aria-label={strings.cancel} onClick={onDecline} className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
      <section className="relative z-10 w-full max-w-sm rounded-2xl border border-ink/10 bg-white p-6 shadow-2xl shadow-ink/25">
        <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-signal">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.7]">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
          </svg>
        </span>

        <h3 id="voice-consent-title" className="mt-3 text-base font-bold text-ink">
          {strings.title}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft/70">{strings.body}</p>

        <ul className="mt-3 space-y-1.5 rounded-xl bg-paper px-3.5 py-3 text-[12px] leading-relaxed text-ink-soft/60">
          <li className="flex gap-2">
            <span aria-hidden className="text-ink-soft/35">·</span>
            {strings.browserNote}
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-ink-soft/35">·</span>
            {strings.noStore}
          </li>
        </ul>

        {permission === 'denied' && <p className="mt-3 text-[12px] leading-relaxed text-rose-600">{strings.denied}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDecline}
            className="rounded-xl border border-ink/12 px-4 py-2 text-sm font-medium text-ink-soft/70 transition hover:border-ink/25"
          >
            {strings.cancel}
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            {strings.allow}
          </button>
        </div>
      </section>
    </div>
  );
}

/** 마이크 버튼 — 검색/전송 버튼 왼쪽에 둔다. */
export function VoiceButton({
  listening,
  onClick,
  disabled,
  label,
  stopLabel,
  /** 얹히는 배경 — 밝은 컴포저(AI Search)와 어두운 패널(debateAI)의 색이 반대다 */
  tone = 'light',
}: {
  listening: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  stopLabel: string;
  tone?: 'light' | 'dark';
}) {
  const idle =
    tone === 'dark'
      ? 'text-white/55 hover:bg-white/10 hover:text-white'
      : 'text-ink-soft/50 hover:bg-paper hover:text-signal';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? stopLabel : label}
      title={listening ? stopLabel : label}
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-35 ${
        listening ? 'bg-rose-500 text-white' : idle
      }`}
    >
      {listening && (
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-rose-400/40 motion-reduce:animate-none"
        />
      )}
      <svg viewBox="0 0 24 24" className="relative h-[18px] w-[18px] fill-none stroke-current stroke-[1.7]" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * 실시간 이퀄라이저 — 입력 영역을 대신 채운다.
 * 아래에는 받아쓰기 결과(확정 + 인식 중)를 함께 보여준다.
 */
export function VoiceWaveform({
  analyser,
  transcript,
  interim,
  placeholder,
  tone = 'light',
}: {
  analyser: React.RefObject<AnalyserNode | null>;
  transcript: string;
  interim: string;
  placeholder: string;
  /** 어두운 패널에서는 글자색이 반대여야 한다 — 밝은 색 그대로면 배경에 묻힌다 */
  tone?: 'light' | 'dark';
}) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    let frame = 0;
    const data = new Uint8Array(64);
    const startedAt = performance.now();

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const bars = barsRef.current;
      const node = analyser.current;
      // 분석기를 붙이지 못한 브라우저에서도 "듣고 있다"는 것은 보여야 한다.
      // 실제 음량 대신 잔잔한 사인파로 대신 움직인다.
      const elapsed = (performance.now() - startedAt) / 1000;
      if (node) node.getByteFrequencyData(data as never);

      for (let i = 0; i < bars.length; i += 1) {
        const bar = bars[i];
        if (!bar) continue;
        // 중앙이 높고 양끝이 낮게 — 소리가 가운데서 퍼지는 모양으로 읽힌다
        const mirrored = i < bars.length / 2 ? i : bars.length - 1 - i;
        const level = node
          ? (data[Math.min(Math.floor(mirrored * 1.6) + 1, data.length - 1)] ?? 0) / 255
          : 0.18 + 0.14 * Math.sin(elapsed * 3.2 + mirrored * 0.55);
        bar.style.height = `${3 + level * 25}px`;
        bar.style.opacity = `${0.35 + level * 0.65}`;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [analyser]);

  const spoken = [transcript, interim].filter(Boolean).join(' ');

  return (
    <div className="min-w-0 flex-1 px-2 py-1" aria-live="polite">
      <div className="flex h-8 items-center justify-center gap-[3px]" aria-hidden>
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <span
            key={i}
            ref={(el) => {
              barsRef.current[i] = el;
            }}
            className="w-[3px] rounded-full bg-gradient-to-t from-brand-400 to-signal transition-[height] duration-75"
            style={{ height: '3px' }}
          />
        ))}
      </div>
      <p
        className={`mt-1 line-clamp-3 text-center text-[13px] leading-relaxed ${
          tone === 'dark' ? 'text-white' : 'text-ink'
        }`}
      >
        {transcript}
        {interim && (
          <span className={tone === 'dark' ? 'text-white/45' : 'text-ink-soft/40'}>
            {transcript ? ' ' : ''}
            {interim}
          </span>
        )}
        {!spoken && (
          <span className={tone === 'dark' ? 'text-white/40' : 'text-ink-soft/35'}>{placeholder}</span>
        )}
      </p>
    </div>
  );
}
