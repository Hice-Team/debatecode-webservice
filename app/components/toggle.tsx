'use client';

// 켜고 끄는 스위치 — 설정 화면의 모든 on/off가 이 모양을 쓴다.
//
// 예전에는 어떤 줄은 체크박스, 어떤 줄은 라디오, 어떤 줄은 "사용" 글자가 붙은 체크박스였다.
// 같은 성격의 조작이 화면마다 다르게 생기면 이용자는 매번 "이건 뭘 하는 거지"를 다시 읽는다.
//
// 네이티브 <input type="checkbox">를 그대로 쓴다 — 스위치처럼 보이게만 하고
// 키보드·스크린리더 동작은 브라우저가 하던 대로 둔다. div로 새로 만들면 그 둘을 다시 짜야 한다.
export default function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** 스위치만 있고 옆에 글자가 없을 때 스크린리더가 읽을 이름 */
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`relative inline-flex shrink-0 items-center ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        // sr-only가 아니라 스위치 위를 덮는 투명 입력이다.
        // sr-only로 두면 보이는 트랙이 클릭을 가로채, 자동화나 보조기기가
        // 입력 자체를 누르려 할 때 막힌다. 덮어 두면 어디를 눌러도 같은 결과가 된다.
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      {/* 트랙 */}
      <span
        aria-hidden
        className="h-6 w-11 rounded-full bg-fg-quiet/35 transition-colors duration-[var(--duration-state)] peer-checked:bg-signal peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal"
      />
      {/* 손잡이 — 움직임을 줄인 사람에게는 위치만 바뀌고 미끄러지지 않는다 */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-[var(--duration-state)] peer-checked:translate-x-5 motion-reduce:transition-none"
      />
    </label>
  );
}
