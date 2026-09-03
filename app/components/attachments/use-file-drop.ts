'use client';

// 입력창에 파일을 끌어다 놓기.
//
// 폴더를 놓으면 안을 훑어 프로젝트 가져오기와 똑같이 다룬다 — 이용자 입장에서 "폴더를
// 통째로 준다"는 행동은 메뉴로 고르든 끌어다 놓든 같은 일이기 때문이다.
//
// dragenter/dragleave는 자식 요소를 지날 때마다 번갈아 발생한다. 그대로 쓰면 커서가
// 버튼 위를 지나칠 때마다 안내가 깜빡인다. 그래서 깊이를 세어 0이 될 때만 끈다.
import { useCallback, useRef, useState, type DragEvent } from 'react';

/** 훑지 않는 폴더 — 빌드 산출물과 의존성은 올려 봐야 맥락만 흐린다. */
const SKIP_DIR = /^(node_modules|\.git|\.next|dist|build|out|venv|__pycache__|\.venv|target)$/;
/** 한 번에 받아들일 최대 파일 수. */
const MAX_FILES = 40;
/** 폴더를 얼마나 깊이 들어갈지 — 이보다 깊으면 대개 생성물이다. */
const MAX_DEPTH = 8;

export interface DroppedFile {
  file: File;
  /** 폴더 안에서의 경로 — 없으면 낱개 파일이다 */
  path?: string;
}

export interface DropResult {
  files: DroppedFile[];
  /** 폴더를 놓았다면 그 이름 — 참조 하나로 묶인다 */
  folder?: string;
  /** 상한에 걸려 일부만 담았는가 */
  limited: boolean;
}

/* ---------- 폴더 훑기 ---------- */

type Entry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file(cb: (file: File) => void, err: (e: unknown) => void): void;
  createReader(): { readEntries(cb: (entries: Entry[]) => void, err: (e: unknown) => void): void };
};

function readEntries(reader: ReturnType<Entry['createReader']>): Promise<Entry[]> {
  return new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));
}

function toFile(entry: Entry): Promise<File | null> {
  return new Promise((resolve) => entry.file(resolve, () => resolve(null)));
}

/** 폴더 하나를 재귀로 훑어 파일 목록을 만든다. */
async function walk(entry: Entry, prefix: string, out: DroppedFile[], depth: number): Promise<void> {
  if (out.length >= MAX_FILES || depth > MAX_DEPTH) return;

  if (entry.isFile) {
    const file = await toFile(entry);
    if (file) out.push({ file, path: `${prefix}${entry.name}` });
    return;
  }
  if (!entry.isDirectory || SKIP_DIR.test(entry.name)) return;

  // readEntries는 한 번에 100개까지만 준다 — 빈 배열이 올 때까지 반복해야 한다
  const reader = entry.createReader();
  for (;;) {
    const batch = await readEntries(reader);
    if (batch.length === 0) break;
    for (const child of batch) {
      if (out.length >= MAX_FILES) return;
      await walk(child, `${prefix}${entry.name}/`, out, depth + 1);
    }
  }
}

/** 놓인 것에서 파일을 꺼낸다. 폴더가 하나 놓였으면 그 이름도 함께 돌려준다. */
async function collect(transfer: DataTransfer): Promise<DropResult> {
  const items = Array.from(transfer.items).filter((item) => item.kind === 'file');

  // webkitGetAsEntry가 있어야 폴더를 알아볼 수 있다. 없으면 낱개 파일로만 받는다.
  const entries = items
    .map((item) => (item.webkitGetAsEntry?.() ?? null) as Entry | null)
    .filter((entry): entry is Entry => entry !== null);

  if (entries.length === 0) {
    const files = Array.from(transfer.files).slice(0, MAX_FILES).map((file) => ({ file }));
    return { files, limited: transfer.files.length > MAX_FILES };
  }

  const out: DroppedFile[] = [];
  const folders = entries.filter((entry) => entry.isDirectory);
  for (const entry of entries) await walk(entry, '', out, 0);

  return {
    files: out,
    // 폴더 하나만 놓았을 때만 그 이름으로 묶는다. 여럿이면 어느 이름을 쓸지 알 수 없다.
    folder: folders.length === 1 && entries.length === 1 ? folders[0].name : undefined,
    limited: out.length >= MAX_FILES,
  };
}

/* ---------- 훅 ---------- */

export function useFileDrop({
  onDrop,
  disabled,
}: {
  onDrop: (result: DropResult) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  // 자식을 지날 때마다 enter/leave가 짝지어 발생한다 — 깊이를 세어야 깜빡이지 않는다
  const depth = useRef(0);

  const reset = useCallback(() => {
    depth.current = 0;
    setDragging(false);
  }, []);

  /** 파일이 실려 있는 드래그인가 — 글자를 끌어다 놓는 경우는 무시한다. */
  const carriesFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer.types).includes('Files');

  const handlers = {
    onDragEnter(event: DragEvent) {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver(event: DragEvent) {
      if (disabled || !carriesFiles(event)) return;
      // 막지 않으면 브라우저가 파일을 새 탭에서 열어 버린다
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave() {
      if (disabled) return;
      depth.current -= 1;
      if (depth.current <= 0) reset();
    },
    async onDrop(event: DragEvent) {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault();
      reset();
      const result = await collect(event.dataTransfer);
      if (result.files.length > 0) onDrop(result);
    },
  };

  return { dragging, handlers };
}
