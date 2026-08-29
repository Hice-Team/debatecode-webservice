'use client';

// SNS 홍보 인증 신청 — 본인이 SNS 게시판에 올린 글을 골라 신청한다.
// URL을 따로 받지 않는 이유: 이미 게시글에 외부 링크가 있어 그것을 근거로 쓰면 위조 여지가 줄어든다.
import { useActionState } from 'react';
import { requestSnsPromo, type MateActionState } from '@/app/lib/actions/mate';

const initialState: MateActionState = {};

export interface SelectablePost {
  id: string;
  title: string;
  url: string;
  platform: string;
}

export default function SnsPromoForm({ posts }: { posts: SelectablePost[] }) {
  const [state, formAction, pending] = useActionState(requestSnsPromo, initialState);

  if (posts.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-fg-muted">
        신청할 수 있는 SNS 글이 없습니다. SNS 게시판에 홍보 글을 먼저 올려 주세요.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="sns-post" className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-fg-muted">
          인증할 게시글
        </label>
        <select
          id="sns-post"
          name="postId"
          required
          defaultValue=""
          className="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-sm focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/25"
        >
          <option value="" disabled>
            게시글을 선택하세요
          </option>
          {posts.map((post) => (
            <option key={post.id} value={post.id}>
              [{post.platform}] {post.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="sns-desc" className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-fg-muted">
          간단 설명 (선택)
        </label>
        <textarea
          id="sns-desc"
          name="description"
          rows={2}
          maxLength={500}
          placeholder="어떤 내용으로 홍보했는지 짧게 적어주세요."
          className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm placeholder:text-fg-quiet focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/25"
        />
      </div>

      {state.errors?.form?.map((message) => (
        <p key={message} role="alert" className="text-xs text-rose-600">
          {message}
        </p>
      ))}
      {state.saved && state.message && <p className="text-xs font-semibold text-emerald-700">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-signal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? '접수 중…' : '홍보 활동 인증 신청'}
      </button>
    </form>
  );
}
