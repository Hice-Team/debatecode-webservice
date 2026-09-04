'use client';

// 발송 한 건 — 요약 줄, 펼치면 수신자별 결과.
//
// 예전에는 "성공 297 · 실패 3"까지만 보였다. 그 3명이 누구인지 알 수 없으니 할 수
// 있는 일이 없었고, 다시 보내려면 297명에게 같은 메일을 한 번 더 보내는 수밖에
// 없었다. 이제 실패한 주소와 사유를 남기고, **실패분에게만** 다시 보낸다.
import { useActionState } from 'react';
import { resendFailed, deleteCampaign, type CampaignState } from '@/app/lib/actions/admin-marketing';
import SendButton from './send-button';

const initialState: CampaignState = {};

export interface DeliveryRow {
  email: string;
  status: string;
  error: string | null;
  attempt: number;
}

export interface CampaignRowData {
  id: string;
  subject: string;
  status: string;
  audienceLabel: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  /** 실패한 수신자 — 화면에 보여 줄 만큼만. 전체 수는 failedCount가 진짜다. */
  failures: DeliveryRow[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: '초안',
  sending: '발송 중',
  sent: '발송 완료',
  failed: '발송 실패',
};

const STATUS_TONES: Record<string, string> = {
  draft: 'border-hairline bg-paper text-fg-secondary',
  sending: 'border-sky-200 bg-sky-50 text-sky-700',
  sent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
};

export default function CampaignRow({ campaign }: { campaign: CampaignRowData }) {
  const [state, formAction, pending] = useActionState(resendFailed, initialState);
  const sendable = campaign.status === 'draft' || campaign.status === 'failed';
  const hasResult = campaign.sentCount > 0 || campaign.failedCount > 0;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{campaign.subject}</p>
          <p className="font-mono text-[11px] text-fg-muted">
            {campaign.audienceLabel} · 대상 {campaign.recipientCount.toLocaleString()}명
            {hasResult && ` · 성공 ${campaign.sentCount.toLocaleString()}`}
            {campaign.failedCount > 0 && (
              <span className="text-rose-600"> · 실패 {campaign.failedCount.toLocaleString()}</span>
            )}
            {' · '}
            {new Date(campaign.sentAt ?? campaign.createdAt).toLocaleDateString('ko-KR')}
          </p>
          {campaign.errorMessage && (
            <p className="mt-1 text-[11px] text-amber-700">{campaign.errorMessage}</p>
          )}
        </div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
            STATUS_TONES[campaign.status] ?? STATUS_TONES.draft
          }`}
        >
          {STATUS_LABELS[campaign.status] ?? campaign.status}
        </span>

        {sendable && (
          <div className="flex shrink-0 items-center gap-2">
            <SendButton
              campaignId={campaign.id}
              subject={campaign.subject}
              recipientCount={campaign.recipientCount}
            />
            <form action={deleteCampaign}>
              <input type="hidden" name="id" value={campaign.id} />
              <button className="rounded-[var(--radius-card)] border border-hairline px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:border-rose-300 hover:text-rose-600">
                삭제
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ---------- 실패분 ---------- */}
      {campaign.failedCount > 0 && (
        <details className="mt-2 rounded-[var(--radius-card)] border border-rose-200 bg-rose-50/50">
          <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-rose-700">
            실패한 {campaign.failedCount.toLocaleString()}명 보기
          </summary>

          <div className="border-t border-rose-200 px-3 py-2.5">
            <ul className="space-y-1">
              {campaign.failures.map((d) => (
                <li key={d.email} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                  <span data-no-translate className="font-mono text-fg">
                    {d.email}
                  </span>
                  {/* 사유를 감추면 같은 실패를 계속 다시 보내게 된다 */}
                  <span className="min-w-0 flex-1 text-fg-muted">{d.error ?? '사유가 기록되지 않았습니다'}</span>
                  {d.attempt > 1 && (
                    <span className="font-mono text-[10px] text-fg-quiet">{d.attempt}번째 시도</span>
                  )}
                </li>
              ))}
            </ul>

            {campaign.failedCount > campaign.failures.length && (
              <p className="mt-1.5 font-mono text-[10px] text-fg-quiet">
                외 {(campaign.failedCount - campaign.failures.length).toLocaleString()}건은 표시하지 않았습니다
              </p>
            )}

            <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={campaign.id} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-full border border-rose-300 px-3.5 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
              >
                {pending ? '다시 보내는 중…' : '실패분만 다시 보내기'}
              </button>
              <span className="text-[11px] text-fg-muted">
                성공한 분에게는 다시 가지 않습니다. 그 사이 수신을 철회한 분은 제외됩니다.
              </span>
            </form>

            {state.errors?.form && (
              <p className="mt-2 text-[12px] text-rose-700">{state.errors.form[0]}</p>
            )}
            {state.saved && <p className="mt-2 text-[12px] text-emerald-700">{state.message}</p>}
          </div>
        </details>
      )}
    </li>
  );
}
