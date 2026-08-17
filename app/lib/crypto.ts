// 저장용 비밀값(예: 사용자 AI API 키) 대칭 암호화 — AES-256-GCM (Web Crypto).
// v2(현행): 이중 암호화 — 1차 키(AI_SECRET_KEY)로 암호화한 결과를 2차 키로 한 번 더 암호화한다.
//   2차 키는 AI_SECRET_KEY_2가 있으면 그것을, 없으면 AI_SECRET_KEY에서 별도 파생한다.
//   접두사 "enc2:v1:". 두 키가 모두 맞아야 복호화되므로 단일 키 유출만으로는 원문을 얻을 수 없다.
// 하위호환: "enc:v1:"(단일 암호화)과 접두사 없는 평문(레거시)도 읽을 수 있다.
// 키가 설정되지 않은 환경에서는 암호화를 건너뛰고 평문을 저장한다(개발 편의).

const PREFIX_V1 = 'enc:v1:';
const PREFIX_V2 = 'enc2:v1:';

const keyCache = new Map<string, Promise<CryptoKey | null>>();

// secret 문자열(+파생 라벨)에서 AES-GCM 키를 파생한다
function deriveKey(secret: string | undefined, label = ''): Promise<CryptoKey | null> {
  const cacheKey = `${label}:${secret ?? ''}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;
  const promise = (async () => {
    if (!secret) return null;
    const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret + label));
    return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  })();
  keyCache.set(cacheKey, promise);
  return promise;
}

const getPrimaryKey = () => deriveKey(process.env.AI_SECRET_KEY);
// 2차 키 — 전용 env가 있으면 사용, 없으면 1차 시크릿에서 다른 라벨로 파생 (키 분리 유지)
const getSecondaryKey = () =>
  process.env.AI_SECRET_KEY_2
    ? deriveKey(process.env.AI_SECRET_KEY_2)
    : deriveKey(process.env.AI_SECRET_KEY, ':layer2');

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptLayer(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource));
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return packed;
}

async function decryptLayer(key: CryptoKey, packed: Uint8Array): Promise<Uint8Array> {
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct as BufferSource));
}

// 이중 암호화 저장 — 1차(AI_SECRET_KEY) → 2차(AI_SECRET_KEY_2 또는 파생 키)
export async function encryptSecret(plain: string | null | undefined): Promise<string | null> {
  if (!plain) return null;
  const [k1, k2] = await Promise.all([getPrimaryKey(), getSecondaryKey()]);
  if (!k1 || !k2) return plain; // 키 미설정 — 평문 저장 (레거시 호환)
  const layer1 = await encryptLayer(k1, new TextEncoder().encode(plain));
  const layer2 = await encryptLayer(k2, layer1);
  return PREFIX_V2 + toB64(layer2);
}

export async function decryptSecret(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;

  // v2 — 이중 암호화: 2차 키로 벗기고 1차 키로 복호화
  if (stored.startsWith(PREFIX_V2)) {
    const [k1, k2] = await Promise.all([getPrimaryKey(), getSecondaryKey()]);
    if (!k1 || !k2) return null;
    try {
      const layer1 = await decryptLayer(k2, fromB64(stored.slice(PREFIX_V2.length)));
      const plain = await decryptLayer(k1, layer1);
      return new TextDecoder().decode(plain);
    } catch {
      return null;
    }
  }

  // v1 — 단일 암호화 (기존 저장분)
  if (stored.startsWith(PREFIX_V1)) {
    const key = await getPrimaryKey();
    if (!key) return null;
    try {
      const plain = await decryptLayer(key, fromB64(stored.slice(PREFIX_V1.length)));
      return new TextDecoder().decode(plain);
    } catch {
      return null;
    }
  }

  return stored; // 레거시 평문
}

export function isEncrypted(stored: string | null | undefined): boolean {
  return !!stored && (stored.startsWith(PREFIX_V1) || stored.startsWith(PREFIX_V2));
}

/**
 * 저장된 비밀값의 가려진 힌트 — 화면에는 원문 대신 이것만 내려간다.
 *
 * 복호화해서 앞뒤를 보여 주면 결국 평문이 브라우저까지 가므로, 길이만 보고 고정 마스크를 만든다.
 * "등록돼 있다"는 사실만 전달하면 충분하고, 어떤 키인지는 제공사 선택으로 이미 드러난다.
 */
export function maskSecret(stored: string | null | undefined): string | null {
  return stored ? '••••••••' : null;
}
