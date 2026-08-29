// 테마 선택의 저장·적용. 색은 CSS가 정하고(app/globals.css), 여기서는 상태만 다룬다.
//
// 'system'을 따로 두는 이유 — 라이트/다크 둘만 두면 OS를 다크로 쓰는 사람에게
// 이 서비스만 밝게 뜨고, 그걸 되돌릴 방법이 "매번 다크를 고르는 것"밖에 없다.
// 고르지 않은 상태를 그대로 두는 것이 기본값이어야 한다.

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

export const THEME_STORAGE_KEY = 'dc:theme';

function isChoice(v: unknown): v is ThemeChoice {
  return v === 'system' || v === 'light' || v === 'dark';
}

/**
 * 첫 페인트 전에 <html>에 테마를 찍는 스크립트.
 *
 * layout.tsx의 <head>에 그대로 넣는다. React가 붙기 전에 실행돼야 한다 —
 * 나중에 적용하면 다크를 고른 사람에게 흰 화면이 한 번 번쩍인다.
 * 예외를 삼키는 이유는 스토리지가 막힌 환경(사생활 보호 모드)에서도 화면이 떠야 하기 때문이다.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}document.documentElement.classList.add('dc-theme-ready');})();`;

/* ---------- 구독 (useSyncExternalStore) ---------- */

const listeners = new Set<() => void>();

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  // 다른 탭에서 바꾸면 이 탭도 따라간다
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function readTheme(): ThemeChoice {
  const attr = document.documentElement.dataset.theme;
  if (isChoice(attr)) return attr;
  return 'system';
}

/** 고른 값을 <html>과 스토리지에 쓴다. 'system'이면 표식을 지운다. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;

  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // 스토리지가 막힌 환경 — 이번 방문에만 적용되고 끝난다. 화면은 그대로 돈다.
  }

  for (const fn of listeners) fn();
}
