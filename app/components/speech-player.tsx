'use client';

// 낭독 재생 바 — useSpeech 컨트롤러 하나를 받아 조작 버튼만 그린다.
//
// 예전에는 "듣기"를 누르면 그것으로 끝이었다. 멈추려면 같은 메뉴를 다시 열어야 했고,
// 얼마나 남았는지도 알 수 없었다. 재생 중에만 나타나는 얇은 바 하나로 정리한다.
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import { SPEECH_RATES, type SpeechController, type SpeechRate } from '@/app/lib/speech';

export default function SpeechPlayer({
  controller,
  tone = 'light',
}: {
  controller: SpeechController;
  /** 어두운 작업 화면(문제 풀이·에디터)에서는 반대 색을 쓴다 */
  tone?: 'light' | 'dark';
}) {
  const { language } = useLanguage();
  const { speaking, paused, rate, progress, pause, resume, stop, setRate } = controller;

  if (!speaking) return null;

  const dark = tone === 'dark';
  const btn = `grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${
    dark ? 'text-fg-on-dark-secondary hover:bg-surface/10 hover:text-white' : 'text-fg-muted hover:bg-paper hover:text-fg'
  }`;

  return (
    <div
      role="group"
      aria-label={t('ai-tts', language)}
      className={`mt-3 flex items-center gap-2 rounded-full border px-2 py-1.5 animate-in fade-in slide-in-from-bottom-1 duration-200 ${
        dark ? 'border-white/10 bg-surface/[0.04]' : 'border-hairline bg-surface'
      }`}
    >
      <button
        type="button"
        onClick={paused ? resume : pause}
        className={btn}
        aria-label={t(paused ? 'tts-resume' : 'tts-pause', language)}
        title={t(paused ? 'tts-resume' : 'tts-pause', language)}
      >
        {paused ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
            <path d="M8 5v14l11-7L8 5Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
            <rect x="7" y="5" width="3.5" height="14" rx="1" />
            <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={stop}
        className={btn}
        aria-label={t('tts-stop', language)}
        title={t('tts-stop', language)}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      </button>

      {/* 진행 — 조각 단위라 정확한 시간은 아니지만 "얼마나 남았는지"는 보인다 */}
      <div
        className={`h-1 min-w-0 flex-1 overflow-hidden rounded-full ${dark ? 'bg-surface/10' : 'bg-paper'}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${
            dark ? 'bg-brand-400' : 'bg-signal'
          }`}
          style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
        />
      </div>

      <label className="flex shrink-0 items-center gap-1">
        <span className="sr-only">{t('tts-speed', language)}</span>
        <select
          value={rate}
          onChange={(e) => setRate(Number(e.target.value) as SpeechRate)}
          className={`rounded-full bg-transparent px-1.5 py-0.5 font-mono text-[11px] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
            dark ? 'text-fg-on-dark-secondary [&>option]:text-fg' : 'text-fg-secondary'
          }`}
        >
          {SPEECH_RATES.map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
