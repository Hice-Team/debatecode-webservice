'use client';

// 홍보 메일 작성 — 왼쪽에 입력, 오른쪽에 실제로 나갈 모습.
// 메일은 회수할 수 없으므로 "보내기 전에 보이는 그대로"를 볼 수 있어야 한다.
//
// 대상도 마찬가지다. 예전에는 회원/비회원 세 칸뿐이었고 숫자만 보여 줬다. 숫자는
// 조건이 맞는지 말해 주지 않는다 — "300명"이 내가 생각한 그 300명인지 확인할
// 방법이 없었다. 조건을 바꾸면 대상 수와 **실제로 들어올 주소 몇 개**를 함께 보여 준다.
import { useActionState, useEffect, useState, useTransition } from 'react';
import { saveCampaign, previewAudience, type CampaignState } from '@/app/lib/actions/admin-marketing';
import {
  AUDIENCE_LABELS,
  SOURCE_LABELS,
  CONSENT_WINDOWS,
  FATIGUE_WINDOWS,
  type Audience,
  type ConsentSourceFilter,
} from '@/app/lib/marketing-audience';

const initialState: CampaignState = {};

const FIELD =
  'w-full rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2 text-sm placeholder:text-fg-quiet focus:border-signal/40 focus:outline-none focus:ring-2 focus:ring-signal/30';
const LABEL = 'block font-mono text-[11px] uppercase tracking-wider text-fg-muted mb-1.5';

const SAMPLE = `# 이번 주 새 기출 세트가 열렸습니다

안녕하세요, debateCode입니다.

- 카카오 2026 상반기 기출 세트 공개
- 실전 모의고사 Vol.4 추가

[문제 풀러 가기](https://debatecode.org/contests)`;

type Preview = {
  count: number;
  sample: { email: string; member: boolean; source: string; lastSentAt: string | null }[];
};

export default function CampaignComposer({ counts }: { counts: Record<Audience, number> }) {
  const [state, formAction, pending] = useActionState(saveCampaign, initialState);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [source, setSource] = useState<ConsentSourceFilter | ''>('');
  const [consentedWithinDays, setConsentedWithinDays] = useState<number | null>(null);
  const [excludeSentWithinDays, setExcludeSentWithinDays] = useState<number | null>(null);

  // 조건이 바뀌면 대상을 다시 센다. 서버의 audienceWhere를 그대로 쓰므로
  // 여기 보이는 수와 실제로 나갈 대상이 갈리지 않는다.
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startPreview(async () => {
      try {
        const next = await previewAudience({
          audience,
          source: source || null,
          consentedWithinDays,
          excludeSentWithinDays,
        });
        if (!cancelled) {
          setPreview(next);
          setPreviewError(null);
        }
      } catch {
        if (!cancelled) setPreviewError('대상을 세지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [audience, source, consentedWithinDays, excludeSentWithinDays]);

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4">
        <div>
          <label htmlFor="subject" className={LABEL}>
            제목
          </label>
          <input
            id="subject"
            name="subject"
            required
            maxLength={120}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="이번 주 새 기출 세트가 열렸습니다"
            className={FIELD}
          />
        </div>

        <div>
          <p className={LABEL}>발송 대상</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((key) => (
              <label
                key={key}
                className={`cursor-pointer rounded-[var(--radius-card)] border px-3 py-2.5 text-sm transition-colors ${
                  audience === key ? 'border-signal bg-signal/10 font-semibold' : 'border-hairline hover:border-fg-quiet'
                }`}
              >
                <input
                  type="radio"
                  name="audience"
                  value={key}
                  checked={audience === key}
                  onChange={() => setAudience(key)}
                  className="sr-only"
                />
                {AUDIENCE_LABELS[key]}
                <span className="mt-0.5 block font-mono text-[11px] font-normal text-fg-muted">
                  {counts[key].toLocaleString()}명
                </span>
              </label>
            ))}
          </div>

          {/* 더 좁히기 — 세 축 모두 기본값은 "가리지 않음"이라 아무것도 고르지
              않으면 위 세 칸만 쓰던 예전과 똑같이 동작한다. */}
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] text-fg-muted">동의 경로</span>
              <select
                name="source"
                value={source}
                onChange={(e) => setSource(e.target.value as ConsentSourceFilter | '')}
                className={`${FIELD} py-1.5 text-xs`}
              >
                <option value="">경로 전체</option>
                {(Object.keys(SOURCE_LABELS) as ConsentSourceFilter[]).map((k) => (
                  <option key={k} value={k}>
                    {SOURCE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block font-mono text-[10px] text-fg-muted">동의 시점</span>
              <select
                name="consentedWithinDays"
                value={consentedWithinDays ?? ''}
                onChange={(e) => setConsentedWithinDays(e.target.value ? Number(e.target.value) : null)}
                className={`${FIELD} py-1.5 text-xs`}
              >
                {CONSENT_WINDOWS.map((w) => (
                  <option key={w.label} value={w.days ?? ''}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block font-mono text-[10px] text-fg-muted">최근 발송 제외</span>
              <select
                name="excludeSentWithinDays"
                value={excludeSentWithinDays ?? ''}
                onChange={(e) => setExcludeSentWithinDays(e.target.value ? Number(e.target.value) : null)}
                className={`${FIELD} py-1.5 text-xs`}
              >
                {FATIGUE_WINDOWS.map((w) => (
                  <option key={w.label} value={w.days ?? ''}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <AudiencePreview
            preview={preview}
            error={previewError}
            loading={previewing && preview === null}
            stale={previewing && preview !== null}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="body" className={LABEL}>
              본문 (마크다운)
            </label>
            <button
              type="button"
              onClick={() => setBody(SAMPLE)}
              className="mb-1.5 text-[11px] font-medium text-signal hover:underline"
            >
              예시 넣기
            </button>
          </div>
          <textarea
            id="body"
            name="body"
            required
            rows={14}
            maxLength={20000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="# 제목&#10;&#10;내용을 입력하세요.&#10;&#10;- 목록&#10;[링크](https://…)"
            className={`${FIELD} resize-y font-mono leading-relaxed`}
          />
          <p className="mt-1 text-[11px] text-fg-muted">
            제목(#), 굵게(**), 목록(-), 링크([글자](https://…))만 적용됩니다. 그 밖의 HTML은 글자로 나갑니다.
          </p>
        </div>

        {state.errors?.form && (
          <div className="space-y-1 rounded-[var(--radius-card)] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            {state.errors.form.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
        {state.saved && (
          <p className="rounded-[var(--radius-card)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-signal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? '저장 중…' : '초안 저장'}
        </button>
        <p className="text-[11px] text-fg-muted">
          저장하면 아래 목록에 쌓입니다. 발송은 목록에서 다시 한 번 확인한 뒤 진행합니다.
        </p>
      </div>

      {/* ---------- 미리보기 ---------- */}
      <div className="lg:sticky lg:top-6">
        <p className={LABEL}>미리보기</p>
        <div className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-[#f6f6f7] p-4">
          <div className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
            <div className="border-b border-hairline px-5 py-3">
              <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-signal">DEBATECODE</span>
            </div>
            <div className="px-5 py-4">
              <p className="mb-3 border-b border-hairline pb-2 text-sm font-semibold text-fg">
                {subject || '(제목 없음)'}
              </p>
              <MarkdownPreview source={body} />
            </div>
            <div className="border-t border-hairline bg-paper/60 px-5 py-3 text-[11px] leading-relaxed text-fg-muted">
              <p>이 메일은 광고성 정보 수신에 동의하신 분께 발송되었습니다.</p>
              <p className="underline">수신거부</p>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

/**
 * 대상 미리보기.
 *
 * 이 숫자를 믿고 되돌릴 수 없는 메일이 나간다. 그래서 네 상태를 전부 그린다 —
 * 세는 중인지, 못 셌는지, 0명인지, 몇 명인지가 각각 다른 화면이어야 한다.
 * 특히 "0명"과 "아직 못 셌음"이 같아 보이면 안 된다.
 */
function AudiencePreview({
  preview,
  error,
  loading,
  stale,
}: {
  preview: Preview | null;
  error: string | null;
  loading: boolean;
  stale: boolean;
}) {
  if (error) {
    return (
      <div className="mt-2 rounded-[var(--radius-card)] border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-2 rounded-[var(--radius-card)] border border-hairline bg-paper px-3 py-2.5">
        <div className="h-4 w-32 animate-pulse rounded bg-hairline" />
        <div className="mt-2 h-3 w-48 animate-pulse rounded bg-hairline" />
      </div>
    );
  }

  if (!preview) return null;

  if (preview.count === 0) {
    return (
      <div className="mt-2 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
        지금 조건에 맞는 대상이 없습니다. 조건을 넓히면 대상이 생깁니다.
      </div>
    );
  }

  return (
    <div
      className={`mt-2 rounded-[var(--radius-card)] border border-hairline bg-paper px-3 py-2.5 transition-opacity ${
        stale ? 'opacity-60' : ''
      }`}
      aria-busy={stale}
    >
      <p className="text-[13px] font-semibold text-fg">
        이 조건이면 <span className="font-mono text-signal">{preview.count.toLocaleString()}</span>명에게 나갑니다
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {preview.sample.map((c) => (
          <li key={c.email} className="flex items-center gap-2 font-mono text-[11px] text-fg-muted">
            <span data-no-translate className="min-w-0 flex-1 truncate">
              {c.email}
            </span>
            <span className="shrink-0 text-fg-quiet">{c.member ? '회원' : '비회원'}</span>
            {c.lastSentAt && (
              <span className="shrink-0 text-fg-quiet">
                최근 발송 {new Date(c.lastSentAt).toLocaleDateString('ko-KR')}
              </span>
            )}
          </li>
        ))}
      </ul>
      {preview.count > preview.sample.length && (
        <p className="mt-1 font-mono text-[10px] text-fg-quiet">
          외 {(preview.count - preview.sample.length).toLocaleString()}명
        </p>
      )}
    </div>
  );
}

/**
 * 서버의 renderMarkdown과 같은 문법만 보여 준다 — 미리보기에서 되던 것이 메일에서 안 되면
 * 미리보기가 아니라 거짓말이 된다. 여기서는 React 노드로 그린다(HTML 주입 없음).
 */
function MarkdownPreview({ source }: { source: string }) {
  if (!source.trim()) return <p className="text-sm text-fg-quiet">본문을 입력하면 여기에 표시됩니다.</p>;

  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 list-disc pl-5 text-[13px] leading-relaxed text-fg">
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) {
      flushList(`l-${index}`);
      return;
    }
    if (/^###\s+/.test(line)) {
      flushList(`l-${index}`);
      blocks.push(<h3 key={index} className="mb-1 mt-3 text-sm font-bold text-fg">{line.replace(/^###\s+/, '')}</h3>);
    } else if (/^##\s+/.test(line)) {
      flushList(`l-${index}`);
      blocks.push(<h2 key={index} className="mb-1.5 mt-4 text-base font-bold text-fg">{line.replace(/^##\s+/, '')}</h2>);
    } else if (/^#\s+/.test(line)) {
      flushList(`l-${index}`);
      blocks.push(<h1 key={index} className="mb-2 text-lg font-bold text-fg">{line.replace(/^#\s+/, '')}</h1>);
    } else if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ''));
    } else {
      flushList(`l-${index}`);
      blocks.push(<p key={index} className="my-1.5 text-[13px] leading-relaxed text-fg">{inline(line)}</p>);
    }
  });
  flushList('l-end');

  return <>{blocks}</>;
}

/** **굵게**와 [글자](https://…)만 처리한다 */
function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      parts.push(<strong key={match.index}>{match[1]}</strong>);
    } else {
      parts.push(
        <span key={match.index} className="text-signal underline">
          {match[2]}
        </span>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
