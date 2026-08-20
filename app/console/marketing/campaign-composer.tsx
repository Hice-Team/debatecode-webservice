'use client';

// 홍보 메일 작성 — 왼쪽에 입력, 오른쪽에 실제로 나갈 모습.
// 메일은 회수할 수 없으므로 "보내기 전에 보이는 그대로"를 볼 수 있어야 한다.
import { useActionState, useState } from 'react';
import { saveCampaign, type CampaignState } from '@/app/lib/actions/admin-marketing';
import { AUDIENCE_LABELS, type Audience } from '@/app/lib/marketing-audience';

const initialState: CampaignState = {};

const FIELD =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm placeholder:text-fg-quiet focus:border-signal/40 focus:outline-none focus:ring-2 focus:ring-signal/30';
const LABEL = 'block font-mono text-[11px] uppercase tracking-wider text-fg-muted mb-1.5';

const SAMPLE = `# 이번 주 새 기출 세트가 열렸습니다

안녕하세요, debateCode입니다.

- 카카오 2026 상반기 기출 세트 공개
- 실전 모의고사 Vol.4 추가

[문제 풀러 가기](https://debatecode.org/contests)`;

export default function CampaignComposer({ counts }: { counts: Record<Audience, number> }) {
  const [state, formAction, pending] = useActionState(saveCampaign, initialState);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');

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
                className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  audience === key ? 'border-signal bg-signal/10 font-semibold' : 'border-ink/15 hover:border-ink/40'
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
          <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            {state.errors.form.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
        {state.saved && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
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
        <div className="overflow-hidden rounded-xl border border-hairline bg-[#f6f6f7] p-4">
          <div className="overflow-hidden rounded-xl border border-hairline bg-white">
            <div className="border-b border-hairline px-5 py-3">
              <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-signal">DEBATECODE</span>
            </div>
            <div className="px-5 py-4">
              <p className="mb-3 border-b border-hairline pb-2 text-sm font-semibold text-ink">
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
      blocks.push(<h3 key={index} className="mb-1 mt-3 text-sm font-bold text-ink">{line.replace(/^###\s+/, '')}</h3>);
    } else if (/^##\s+/.test(line)) {
      flushList(`l-${index}`);
      blocks.push(<h2 key={index} className="mb-1.5 mt-4 text-base font-bold text-ink">{line.replace(/^##\s+/, '')}</h2>);
    } else if (/^#\s+/.test(line)) {
      flushList(`l-${index}`);
      blocks.push(<h1 key={index} className="mb-2 text-lg font-bold text-ink">{line.replace(/^#\s+/, '')}</h1>);
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
