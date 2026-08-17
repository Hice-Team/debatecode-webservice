// "Drive에서 파일 추가" — Google Picker로 파일을 고르고 내용을 받아온다.
//
// 브라우저에서만 돌아가며, 고른 파일은 곧바로 서비스 스토리지에 올려 일반 첨부와 똑같이 다룬다.
// (Drive 링크만 붙이면 나중에 권한이 바뀌었을 때 열리지 않기 때문이다.)
//
// 필요한 환경변수 — 없으면 메뉴에서 안내 문구만 띄우고 아무 것도 하지 않는다.
//   NEXT_PUBLIC_GOOGLE_CLIENT_ID  OAuth 2.0 클라이언트 ID (승인된 JS 원본에 서비스 도메인 등록)
//   NEXT_PUBLIC_GOOGLE_API_KEY    Picker API 키

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

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

interface PickedFile {
  file: File;
  driveId: string;
}

export function isDriveConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && process.env.NEXT_PUBLIC_GOOGLE_API_KEY);
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
  loaded.set(src, promise);
  return promise;
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
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
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
): Promise<PickedFile | null> {
  const exportAs = EXPORT_AS[doc.mimeType];
  const endpoint = exportAs
    ? `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=${encodeURIComponent(exportAs.mime)}`
    : `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`;

  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;

  const blob = await res.blob();
  const name = exportAs && !doc.name.endsWith(`.${exportAs.ext}`) ? `${doc.name}.${exportAs.ext}` : doc.name;
  return {
    driveId: doc.id,
    file: new File([blob], name, { type: exportAs?.mime ?? doc.mimeType }),
  };
}

/**
 * Picker를 열고, 고른 파일들을 File 객체로 돌려준다.
 * 사용자가 취소하면 빈 배열을 준다(에러가 아니다).
 */
export async function pickFromDrive(): Promise<File[]> {
  if (!isDriveConfigured()) throw new Error('not-configured');

  const token = await requestAccessToken();
  await loadPicker();

  const docs = await new Promise<Array<{ id: string; name: string; mimeType: string }>>((resolve) => {
    const view = new window.google.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(false);
    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY)
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) resolve(data.docs ?? []);
        else if (data.action === window.google.picker.Action.CANCEL) resolve([]);
      })
      .build();
    picker.setVisible(true);
  });

  const results = await Promise.all(docs.map((doc) => download(doc, token)));
  return results.filter((r): r is PickedFile => r !== null).map((r) => r.file);
}
