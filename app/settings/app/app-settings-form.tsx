'use client';

// 일반 설정 — 표시 언어, 시간·지역 표기, 에디터 기본값, 알림.
//
// 예전에는 같은 "면접·리팩토링 기본 모델" 패널이 이 폼 안에 **두 번** 들어 있었다.
// 같은 id·name을 가진 select가 둘이라 아래 것을 고쳐도 위 값이 저장됐다.
// 지금은 그 항목을 AI 설정으로 옮겼다 — 모델을 고르는 자리는 한 군데여야 한다.
//
// 배치는 카드 격자가 아니라 상하 목록이다. 설정은 "무엇을 바꿀 수 있는가"의 목록이고,
// 목록은 줄로 읽을 때 가장 빨리 훑힌다(DESIGN.md §5).
import { useActionState, useState } from 'react';
import { updateAppSettings, type AppSettingsFormState } from '@/app/lib/actions/profile';
import { LANGUAGE_LABELS, type Language } from '@/app/lib/types';
import { useLanguage } from '@/app/context/language-context';
import { useSettingsForm } from '../save-bar';
import Toggle from '@/app/components/toggle';
import {
  COUNTRIES,
  DATE_FORMATS,
  EDITOR_FONTS,
  EDITOR_FONT_SIZES,
  EDITOR_TAB_SIZES,
  NOTIFY_CHANNELS,
  TIMEZONES,
  type EditorPrefs,
  type NotifyPrefs,
} from '@/app/lib/user-prefs';

const initialState: AppSettingsFormState = {};

const SELECT =
  'rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2 text-sm text-fg focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20';

/** 이름 · 설명 · 조작부 한 줄 */
function Row({
  label,
  desc,
  htmlFor,
  children,
}: {
  label: string;
  desc?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-hairline py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
        </label>
        {desc && <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-4">
      <h3 className="font-display text-[15px] font-bold tracking-tight text-fg">{title}</h3>
      {desc && <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">{desc}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default function AppSettingsForm({
  initial,
}: {
  initial: {
    emailNotifications: boolean;
    preferredLanguage: string;
    timezone: string;
    dateFormat: string;
    country: string;
    editor: EditorPrefs;
    notify: NotifyPrefs;
  };
}) {
  const [state, formAction, pending] = useActionState(updateAppSettings, initialState);
  const { language: uiLanguage, setLanguage: setUiLanguage } = useLanguage();
  const settingsForm = useSettingsForm();

  // 토글은 값이 화면에 남아야 해서 상태로 들고, 제출은 hidden input이 맡는다.
  // 체크박스를 그대로 쓰면 스위치 모양을 다시 만들어야 하고, 그러면 이 화면만
  // 다른 스위치를 갖게 된다.
  const [emailOn, setEmailOn] = useState(initial.emailNotifications);
  const [notify, setNotify] = useState<NotifyPrefs>(initial.notify);
  const [editor, setEditor] = useState<EditorPrefs>(initial.editor);

  return (
    <form action={formAction} {...settingsForm}>
      {/* ── 언어와 표기 ─────────────────────────────────────────── */}
      <Group title="언어와 표기" desc="화면에 쓰는 말과, 날짜·시각을 그리는 방식입니다.">
        <Row
          label="앱 표시 언어"
          desc="고르는 즉시 적용되며 이 브라우저에만 저장됩니다."
          htmlFor="uiLanguage"
        >
          <select
            id="uiLanguage"
            value={uiLanguage}
            onChange={(e) => setUiLanguage(e.target.value as 'ko' | 'en')}
            className={SELECT}
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </Row>

        <Row label="시간대" desc="비워 두면 이 기기의 시간대를 따릅니다." htmlFor="timezone">
          <select id="timezone" name="timezone" defaultValue={initial.timezone} className={SELECT}>
            <option value="">이 기기의 시간대 따르기</option>
            {TIMEZONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="날짜 표기" desc="목록과 기록에 날짜를 적는 방식입니다." htmlFor="dateFormat">
          <select id="dateFormat" name="dateFormat" defaultValue={initial.dateFormat} className={SELECT}>
            {DATE_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="국가" desc="선택 사항입니다. 통계와 지역별 안내에만 쓰입니다." htmlFor="country">
          <select id="country" name="country" defaultValue={initial.country} className={SELECT}>
            <option value="">선택 안 함</option>
            {COUNTRIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Row>
      </Group>

      {/* ── 코드 에디터 ─────────────────────────────────────────── */}
      <Group title="코드 에디터" desc="문제 풀이 화면의 에디터가 이 값으로 열립니다.">
        <Row label="기본 언어" desc="문제가 여러 언어를 지원할 때 처음 고를 언어입니다." htmlFor="preferredLanguage">
          <select
            id="preferredLanguage"
            name="preferredLanguage"
            defaultValue={initial.preferredLanguage}
            className={SELECT}
          >
            <option value="">문제가 정한 순서대로</option>
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l]}
              </option>
            ))}
          </select>
        </Row>

        <Row label="글자 크기" htmlFor="editorFontSize">
          <select
            id="editorFontSize"
            name="editorFontSize"
            value={editor.fontSize}
            onChange={(e) => setEditor((p) => ({ ...p, fontSize: Number(e.target.value) }))}
            className={SELECT}
          >
            {EDITOR_FONT_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}px
              </option>
            ))}
          </select>
        </Row>

        <Row
          label="들여쓰기 폭"
          desc="언어를 따르면 파이썬은 4칸, 자바스크립트는 2칸으로 열립니다."
          htmlFor="editorTabSize"
        >
          <select
            id="editorTabSize"
            name="editorTabSize"
            value={editor.tabSize}
            onChange={(e) => setEditor((p) => ({ ...p, tabSize: Number(e.target.value) }))}
            className={SELECT}
          >
            <option value={0}>언어를 따름</option>
            {EDITOR_TAB_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}칸
              </option>
            ))}
          </select>
        </Row>

        <Row label="글꼴" htmlFor="editorFontFamily">
          <select
            id="editorFontFamily"
            name="editorFontFamily"
            value={editor.fontFamily}
            onChange={(e) =>
              setEditor((p) => ({ ...p, fontFamily: e.target.value as EditorPrefs['fontFamily'] }))
            }
            className={SELECT}
          >
            {EDITOR_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="자동 완성 추천" desc="입력하는 동안 후보를 띄웁니다.">
          <Toggle
            label="자동 완성 추천"
            checked={editor.autocomplete}
            onChange={(v) => setEditor((p) => ({ ...p, autocomplete: v }))}
          />
        </Row>
        <input type="hidden" name="editorAutocomplete" value={editor.autocomplete ? 'on' : 'off'} />

        <Row label="자동 줄바꿈" desc="긴 줄을 가로로 스크롤하지 않고 접어서 보여 줍니다.">
          <Toggle
            label="자동 줄바꿈"
            checked={editor.wordWrap}
            onChange={(v) => setEditor((p) => ({ ...p, wordWrap: v }))}
          />
        </Row>
        <input type="hidden" name="editorWordWrap" value={editor.wordWrap ? 'on' : 'off'} />

        <Row label="미니맵" desc="오른쪽에 코드 전체의 축소판을 띄웁니다.">
          <Toggle
            label="미니맵"
            checked={editor.minimap}
            onChange={(v) => setEditor((p) => ({ ...p, minimap: v }))}
          />
        </Row>
        <input type="hidden" name="editorMinimap" value={editor.minimap ? 'on' : 'off'} />
      </Group>

      {/* ── 알림 ────────────────────────────────────────────────── */}
      <Group
        title="알림"
        desc="이메일로 받을 소식을 고릅니다. 주 스위치를 끄면 아래 선택과 상관없이 보내지 않습니다."
      >
        <Row label="이메일 알림 받기" desc="이 스위치가 꺼져 있으면 어떤 알림도 보내지 않습니다.">
          <Toggle label="이메일 알림 받기" checked={emailOn} onChange={setEmailOn} />
        </Row>
        <input type="hidden" name="emailNotifications" value={emailOn ? 'on' : 'off'} />

        <div className={emailOn ? '' : 'opacity-50'}>
          {NOTIFY_CHANNELS.map((ch) => (
            <div key={ch.id}>
              <Row
                label={ch.live === false ? `${ch.label} (준비 중)` : ch.label}
                desc={
                  ch.required
                    ? `${ch.desc} · 끌 수 없습니다.`
                    : ch.live === false
                      ? `${ch.desc} · 아직 발송하지 않습니다. 시작하면 여기 설정대로 보냅니다.`
                      : ch.desc
                }
              >
                <Toggle
                  label={ch.label}
                  checked={ch.required ? true : notify[ch.id]}
                  disabled={ch.required || !emailOn}
                  onChange={(v) => setNotify((p) => ({ ...p, [ch.id]: v }))}
                />
              </Row>
              <input
                type="hidden"
                name={`notify_${ch.id}`}
                value={ch.required || notify[ch.id] ? 'on' : 'off'}
              />
            </div>
          ))}
        </div>
      </Group>

      {state.errors?.form && (
        <p className="mt-4 rounded-[var(--radius-card)] border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {state.errors.form[0]}
        </p>
      )}
      {pending && <p className="mt-4 font-mono text-[11px] text-fg-quiet">저장 중…</p>}
    </form>
  );
}
