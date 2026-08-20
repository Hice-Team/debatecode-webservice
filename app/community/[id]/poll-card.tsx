// 투표 카드 — 서버 컴포넌트. 선택지 버튼이 votePoll 서버 액션 폼으로 동작한다.
// 같은 선택지를 다시 누르면 취소, 다른 선택지를 누르면 변경.
import Link from 'next/link';
import { votePoll } from '@/app/lib/actions/community';
import I18nSlot from '@/app/components/i18n-slot';

export interface PollData {
  id: string;
  question: string | null;
  options: string[];
  votes: { userId: string; optionIndex: number }[];
}

export default function PollCard({ poll, currentUserId }: { poll: PollData; currentUserId: string | null }) {
  const counts = poll.options.map((_, i) => poll.votes.filter((v) => v.optionIndex === i).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const myVote = currentUserId ? (poll.votes.find((v) => v.userId === currentUserId)?.optionIndex ?? null) : null;

  return (
    <div className="mt-5 rounded-xl border border-hairline bg-paper p-5">
      <p className="font-mono text-[11px] text-fg-quiet tracking-wider mb-1">
        📊 <I18nSlot k="poll-title" fallback="투표 · 총" /> {total}
        <I18nSlot k="poll-votes-unit" fallback="표" />
      </p>
      {poll.question && <p className="mb-3 font-semibold text-ink-soft">{poll.question}</p>}
      <div className={`space-y-2 ${poll.question ? '' : 'mt-2'}`}>
        {poll.options.map((option, i) => {
          const count = counts[i];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const mine = myVote === i;
          return (
            <form key={i} action={votePoll}>
              <input type="hidden" name="attachmentId" value={poll.id} />
              <input type="hidden" name="optionIndex" value={i} />
              <button
                type="submit"
                disabled={!currentUserId}
                title={option}
                className={`relative w-full overflow-hidden rounded-lg border px-4 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed ${
                  mine ? 'border-signal bg-white font-semibold text-ink-soft' : 'border-ink/15 bg-white text-fg-secondary hover:border-ink/40'
                }`}
              >
                {/* 득표 비율 바 */}
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 ${mine ? 'bg-signal/25' : 'bg-ink/5'}`}
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-2">
                  <span className="truncate">
                    {mine && <span className="mr-1.5 text-signal">✓</span>}
                    {option}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                    {count}
                    <I18nSlot k="poll-votes-unit" fallback="표" /> · {pct}%
                  </span>
                </span>
              </button>
            </form>
          );
        })}
      </div>
      {!currentUserId && (
        <p className="mt-3 text-xs text-fg-quiet">
          <Link href="/login" className="underline underline-offset-2 hover:text-ink-soft">
            <I18nSlot k="login" fallback="로그인" />
          </Link>
          <I18nSlot k="poll-login-suffix" fallback="하면 투표에 참여할 수 있습니다." />
        </p>
      )}
    </div>
  );
}
