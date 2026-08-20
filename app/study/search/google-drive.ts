// "Drive에서 파일 추가" — Google Picker로 파일을 고르고 내용을 받아온다.
//
// 브라우저에서만 돌아가며, 고른 파일은 곧바로 서비스 스토리지에 올려 일반 첨부와 똑같이 다룬다.
// (Drive 링크만 붙이면 나중에 권한이 바뀌었을 때 열리지 않기 때문이다.)
//
// 권한 범위는 drive.file 이다 — 이용자가 Picker에서 고른 파일에만 접근할 수 있고,
// Drive 전체를 읽는 drive.readonly(제한된 범위)와 달리 구글의 연 1회 보안 평가(CASA)
// 대상이 아니다. 대신 고른 파일을 실제로 내려받으려면 Picker에 앱 ID(클라우드
// 프로젝트 번호)를 알려 줘야 하므로 APP_ID까지 갖춰져야 기능이 켜진다.
//
// 필요한 환경변수 — 하나라도 없으면 메뉴에서 안내 문구만 띄우고 아무 것도 하지 않는다.
//   NEXT_PUBLIC_GOOGLE_CLIENT_ID  OAuth 2.0 클라이언트 ID (승인된 JS 원본에 서비스 도메인 등록)
//   NEXT_PUBLIC_GOOGLE_API_KEY    Picker API 키
//   NEXT_PUBLIC_GOOGLE_APP_ID     클라우드 프로젝트 번호 (drive.file 권한으로 내려받으려면 필수)

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Google Docs 계열은 원본 바이트가 없어 내보내기 형식을 지정해야 한다. */
const EXPORT_AS: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: 'pptx',
  },
};

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID;

export function isDriveConfigured(): boolean {
  return !!(CLIENT_ID && API_KEY && APP_ID);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- gapi/GIS는 타입 선언을 제공하지 않는다 */
declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

const loaded = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = loaded.get(src);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`${src} 로드 실패`));
    document.head.appendChild(el);
  });
  // 실패한 약속을 캐시에 남기면 이후 시도가 영원히 같은 실패를 되돌려준다.
  // (일시적인 네트워크 오류 뒤 다시 시도할 수 있어야 한다.)
  loaded.set(
    src,
    promise.catch((error) => {
      loaded.delete(src);
      throw error;
    }),
  );
  return loaded.get(src)!;
}

/** Picker 모듈이 준비될 때까지 기다린다. */
async function loadPicker(): Promise<void> {
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((resolve, reject) => {
    window.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Picker 로드 실패')) });
  });
}

/** 읽기 전용 액세스 토큰을 받는다 — 팝업이 뜨므로 반드시 사용자 클릭에서 호출한다. */
async function requestAccessToken(): Promise<string> {
  await loadScript('https://accounts.google.com/gsi/client');
  return new Promise<string>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response: { access_token?: string; error?: string }) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error ?? '권한을 받지 못했습니다.'));
      },
      error_callback: () => reject(new Error('cancelled')),
    });
    client.requestAccessToken();
  });
}

/** 고른 파일의 실제 바이트를 받아 File로 만든다. */
async function download(
  doc: { id: string; name: string; mimeType: string },
  token: string,
): Promise<File | null> {
  const exportAs = EXPORT_AS[doc.mimeType];
  const endpoint = exportAs
    ? `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=${encodeURIComponent(exportAs.mime)}`
    : `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!res || !res.ok) return null;

  const blob = await res.blob();
  const name = exportAs && !doc.name.endsWith(`.${exportAs.ext}`) ? `${doc.name}.${exportAs.ext}` : doc.name;
  return new File([blob], name, { type: exportAs?.mime ?? doc.mimeType });
}

/**
 * Picker를 열고, 고른 파일들을 File 객체로 돌려준다.
 * 사용자가 취소하면 빈 배열을 준다(에러가 아니다).
 * `failed`는 고르기는 했지만 내려받지 못한 파일 수 — 조용히 사라지지 않도록 알려 준다.
 */
export async function pickFromDrive(): Promise<{ files: File[]; failed: number }> {
  if (!isDriveConfigured()) throw new Error('not-configured');

  const token = await requestAccessToken();
  await loadPicker();

  const docs = await new Promise<Array<{ id: string; name: string; mimeType: string }>>((resolve) => {
    const view = new window.google.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(false);
    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      // drive.file 권한으로 고른 파일을 내려받으려면 어느 앱이 골랐는지 알려 줘야 한다
      .setAppId(APP_ID)
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) resolve(data.docs ?? []);
        else if (data.action === window.google.picker.Action.CANCEL) resolve([]);
      })
      .build();
    picker.setVisible(true);
  });

  const results = await Promise.all(docs.map((doc) => download(doc, token)));
  const files = results.filter((file): file is File => file !== null);
  return { files, failed: results.length - files.length };
}
