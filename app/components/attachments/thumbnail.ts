// 캐러셀 썸네일용 그림 뽑기 — 브라우저에서만 돈다.
//
// 이미지는 objectURL이면 충분하지만 영상·음원은 그렇지 않다.
// 영상은 첫 프레임을 캔버스에 그려 포스터를 만들고, 음원은 ID3 태그 안의
// 앨범 아트(APIC)를 꺼낸다. 아트가 없는 음원은 그릴 그림이 없으므로 null을 준다
// (그 경우 썸네일 대신 확장자 타일로 내려간다 — thumbKindOf 참고).

/** 첫 프레임을 잡을 시점 — 0초는 검은 화면인 영상이 많다. */
const POSTER_SEEK_SECONDS = 0.25;
const POSTER_MAX_EDGE = 256;

/** 영상 첫 프레임을 dataURL로. 실패하면 null(타일로 내려간다). */
export function videoPoster(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      resolve(value);
    };

    // 큰 영상에서 메타데이터가 끝내 오지 않을 수 있다 — 마냥 기다리지 않는다
    const timer = setTimeout(() => finish(null), 8000);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.onloadeddata = () => {
      video.currentTime = Math.min(POSTER_SEEK_SECONDS, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/webp', 0.7));
      } catch {
        finish(null);
      }
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    video.src = objectUrl;
  });
}

/* ---------- 앨범 아트 ---------- */

/** ID3v2 헤더가 쓰는 7비트 syncsafe 정수. */
function syncsafe(view: DataView, offset: number): number {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

/**
 * ID3v2 태그에서 첫 APIC(그림) 프레임을 꺼낸다.
 * `start`는 태그가 시작하는 위치 — mp3는 0, wav는 'id3 ' 청크 안이다.
 */
function readApic(bytes: Uint8Array, start: number): { mime: string; data: Uint8Array } | null {
  if (ascii(bytes, start, 3) !== 'ID3') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const major = bytes[start + 3];
  const tagSize = syncsafe(view, start + 6);
  const end = Math.min(bytes.length, start + 10 + tagSize);

  let p = start + 10;
  while (p + 10 <= end) {
    const id = ascii(bytes, p, 4);
    // v2.2는 프레임 id가 3글자(PIC)라 구조가 다르다 — 흔치 않으므로 건너뛴다
    if (major < 3) return null;
    const rawSize = view.getUint32(p + 4);
    // v2.4는 프레임 크기도 syncsafe다. 값이 어긋나면 통짜 정수로 다시 읽는다.
    const size = major >= 4 ? syncsafe(view, p + 4) : rawSize;
    if (size <= 0 || p + 10 + size > end) return null;

    if (id === 'APIC') {
      let q = p + 10;
      q += 1; // 텍스트 인코딩 바이트
      let mime = '';
      while (q < end && bytes[q] !== 0) {
        mime += String.fromCharCode(bytes[q]);
        q += 1;
      }
      q += 1; // MIME 종료 NUL
      q += 1; // picture type
      // 설명 문자열 — 인코딩에 따라 NUL 하나 또는 둘로 끝난다
      const encoding = bytes[p + 10];
      if (encoding === 1 || encoding === 2) {
        while (q + 1 < end && !(bytes[q] === 0 && bytes[q + 1] === 0)) q += 2;
        q += 2;
      } else {
        while (q < end && bytes[q] !== 0) q += 1;
        q += 1;
      }
      const imageEnd = p + 10 + size;
      if (q >= imageEnd) return null;
      return { mime: mime || 'image/jpeg', data: bytes.subarray(q, imageEnd) };
    }
    // 빈 id는 패딩 구간 — 여기서부터는 프레임이 없다
    if (id.trim() === '') return null;
    p += 10 + size;
  }
  return null;
}

/** WAV(RIFF) 컨테이너 안의 'id3 ' 청크 위치를 찾는다. */
function findWavId3(bytes: Uint8Array): number | null {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 12;
  while (p + 8 <= bytes.length) {
    const id = ascii(bytes, p, 4).toLowerCase();
    const size = view.getUint32(p + 4, true);
    if (id === 'id3 ') return p + 8;
    // 청크는 짝수 바이트로 정렬된다
    p += 8 + size + (size % 2);
    if (size <= 0) break;
  }
  return null;
}

/** 앨범 아트를 읽기 위해 앞에서 떼어 보는 양 — 태그는 파일 머리에 있다. */
const TAG_SCAN_BYTES = 3 * 1024 * 1024;

/**
 * mp3 · wav에서 앨범 아트를 꺼내 dataURL로 돌려준다.
 * 아트가 없으면 null — 호출부는 그때 확장자 타일을 그린다.
 */
export async function audioArt(file: File): Promise<string | null> {
  try {
    const head = new Uint8Array(await file.slice(0, TAG_SCAN_BYTES).arrayBuffer());
    const start = /\.wav$/i.test(file.name) ? findWavId3(head) : 0;
    if (start === null) return null;

    const picture = readApic(head, start);
    if (!picture || picture.data.length === 0) return null;

    const blob = new Blob([picture.data.slice() as unknown as BlobPart], { type: picture.mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
