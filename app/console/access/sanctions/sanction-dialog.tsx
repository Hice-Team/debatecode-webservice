'use client';

// 제재 발급 — 3단계 마법사.
//
// ① 근거   무엇을 보고 거는가 (신고 ID / 메모)
// ② 조치   어떤 기능을, 얼마나
// ③ 확인   이용자에게 실제로 보일 문구를 그대로 보여 주고 발급
//
// 예전에는 유형·기간·사유를 한 화면에서 받고 바로 적용했다. 그래서 근거가 남지 않았고,
// 이의제기가 들어오면 "왜 걸었는지"를 기억에 의존해 답해야 했다. 또 이용자에게 어떤
// 문구가 가는지 운영자가 볼 수 없어, 통지 내용과 실제 조치가 어긋나는 일이 있었다.
import { useActionState, useState } from 'react';
import { issueSanctionAction, type AccessFormState } from '@/app/lib/actions/admin-access';
import {
  SANCTION_TYPES,
  SANCTION_TYPE_LABEL,
  SANCTION_TYPE_DESC,
  SANCTION_PRESETS,
  sanctionNotice,
  type SanctionType,
} from '@/app/lib/sanctions';
import { FIELD, FOCUS } from '../../ui';
import { Shell, Footer } from '../directory/role-change-dialog';

const initial: AccessFormState = {};

export interface SanctionTargetInfo {
  id: string;
  name: string;
}

export default function SanctionDialog({
  target,
  onClose,
  presetReportIds = [],
  presetReason = '',
}: {
  target: SanctionTargetInfo;
  onClose: () => void;
  /** 신고 워크스페이스에서 넘어온 경우 근거로 자동 첨부된다 */
  presetReportIds?: string[];
  presetReason?: string;
}) {
  const [state, formAction, pending] = useActionState(issueSanctionAction, initial);
  const [step, setStep] = useState(presetReportIds.length > 0 ? 2 : 1);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [type, setType] = useState<SanctionType>('post');
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState(presetReason);

  if (state.saved) {
    return (
      <Shell title="제재 발급 완료" onClose={onClose}>
        <p className="px-6 py-6 text-sm text-emerald-800">{state.saved}</p>
        <Footer>
          <button type="button" onClick={onClose} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
            닫기
          </button>
        </Footer>
      </Shell>
    );
  }

  const canAdvance = step === 1 ? true : step === 2 ? reason.trim().length >= 4 : true;

  return (
    <Shell title={`제재 발급 — ${target.name}`} onClose={onClose}>
      {/* 단계 표시 */}
      <div className="flex items-center gap-1 border-b border-ink/10 bg-paper/40 px-6 py-2.5">
        {['근거', '조치', '확인'].map((label, i) => (
          <div key={label} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="mx-1 h-px w-4 bg-ink/15" />}
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                step === i + 1
                  ? 'bg-signal text-white'
                  : step > i + 1
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-ink/[0.06] text-ink-soft/45'
              }`}
            >
              {i + 1}. {label}
            </span>
          </div>
        ))}
      </div>

      <form action={formAction}>
        <input type="hidden" name="userId" value={target.id} />
        <input type="hidden" name="reportIds" value={presetReportIds.join(',')} />
        <input type="hidden" name="evidenceNote" value={evidenceNote} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="days" value={days} />
        <input type="hidden" name="reason" value={reason} />

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          {/* ① 근거 */}
          {step === 1 && (
            <>
              <p className="text-xs leading-relaxed text-ink-soft/65">
                무엇을 보고 제재하는지 남깁니다. 이의제기가 들어왔을 때 답할 수 있는 유일한 재료입니다.
              </p>
              {presetReportIds.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-emerald-900">
                    신고 {presetReportIds.length}건이 근거로 첨부됩니다
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-emerald-800/70">
                    {presetReportIds.slice(0, 3).join(', ')}
                    {presetReportIds.length > 3 && ' …'}
                  </p>
                </div>
              )}
              <div>
                <label htmlFor="evidence-note" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
                  근거 메모 {presetReportIds.length === 0 && '(권장)'}
                </label>
                <textarea
                  id="evidence-note"
                  rows={4}
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  placeholder="예: 자유게시판 3건에서 동일 광고 링크 반복 게시. 신고 5건 접수. 원문 URL …"
                  className={FIELD}
                />
              </div>
            </>
          )}

          {/* ② 조치 */}
          {step === 2 && (
            <>
              <fieldset>
                <legend className="mb-2 font-mono text-xs tracking-wider text-ink-soft/60">제한할 기능</legend>
                <div className="space-y-1.5">
                  {SANCTION_TYPES.map((t) => (
                    <label
                      key={t}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                        type === t ? 'border-rose-400 bg-rose-50/50' : 'border-ink/10 hover:border-ink/25'
                      }`}
                    >
                      <input
                        type="radio"
                        checked={type === t}
                        onChange={() => setType(t)}
                        className="mt-0.5 h-4 w-4 accent-rose-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{SANCTION_TYPE_LABEL[t]} 제한</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-soft/55">
                          {SANCTION_TYPE_DESC[t]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 font-mono text-xs tracking-wider text-ink-soft/60">기간</legend>
                <div className="flex flex-wrap gap-1.5">
                  {SANCTION_PRESETS.map((p) => (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => setDays(p.days)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${FOCUS} ${
                        days === p.days
                          ? p.days === 0
                            ? 'border-rose-500 bg-rose-600 text-white'
                            : 'border-signal bg-signal text-white'
                          : 'border-ink/15 text-ink-soft/70 hover:border-ink/40'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {days === 0 && (
                  <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
                    영구 제재는 스스로 만료되지 않습니다. 해제하려면 운영자가 직접 풀어야 합니다.
                  </p>
                )}
              </fieldset>

              <div>
                <label htmlFor="sanction-reason" className="mb-1.5 block font-mono text-xs tracking-wider text-ink-soft/60">
                  사유 (필수 · 이용자에게 그대로 표시됩니다)
                </label>
                <input
                  id="sanction-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={4}
                  placeholder="예: 커뮤니티 가이드라인 위반 — 광고성 게시물 반복 등록"
                  className={FIELD}
                />
              </div>
            </>
          )}

          {/* ③ 확인 */}
          {step === 3 && (
            <>
              <div className="rounded-xl border border-ink/10 bg-paper/40 p-3.5 text-xs">
                <dl className="space-y-1.5">
                  <Row label="대상" value={target.name} />
                  <Row label="조치" value={`${SANCTION_TYPE_LABEL[type]} 제한`} />
                  <Row label="기간" value={days > 0 ? `${days}일` : '영구 (만료 없음)'} />
                  <Row label="근거" value={presetReportIds.length > 0 ? `신고 ${presetReportIds.length}건` : evidenceNote || '(메모 없음)'} />
                </dl>
              </div>

              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft/45">
                  이용자에게 표시되는 문구
                </p>
                <pre className="whitespace-pre-wrap rounded-xl border border-ink/15 bg-white px-3.5 py-3 font-sans text-xs leading-relaxed text-ink-soft/80">
                  {sanctionNotice(type, days, reason)}
                </pre>
              </div>
            </>
          )}

          {state.error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{state.error}</p>
          )}
        </div>

        <Footer>
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className={`mr-auto rounded-xl border border-ink/15 px-4 py-2 text-sm text-ink-soft/70 ${FOCUS}`}
            >
              ← 이전
            </button>
          )}
          <button type="button" onClick={onClose} className={`rounded-xl border border-ink/15 px-4 py-2 text-sm text-ink-soft/70 ${FOCUS}`}>
            취소
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40"
            >
              다음 →
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? '적용 중…' : '제재 발급'}
            </button>
          )}
        </Footer>
      </form>
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-soft/40">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-ink-soft/80">{value}</dd>
    </div>
  );
}
