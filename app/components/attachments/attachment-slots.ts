'use client';

// 첨부 상태 한 곳 — 히어로 검색바와 대화 컴포저가 함께 쓴다.
// 둘이 각자 관리하면 어느 한쪽에서만 규칙이 어긋나고, 그건 화면을 봐야만 발견된다.
//
// 두 가지를 들고 있다.
//   files  올라간 첨부 — 썸네일 캐러셀(thumbs)과 입력창 안 멘션(mentions)으로 갈린다
//   tasks  올라가는 중인 파일 — 진행률과 취소를 들고 캐러셀 맨 앞에 선다
//
// 업로드를 화면 쪽이 아니라 여기서 돌리는 이유는 진행률 때문이다. 첨부 메뉴가 업로드를
// 혼자 붙들고 있으면 "다 끝난 뒤에 한꺼번에" 나타나고, 500MB짜리 동영상을 붙이는 동안
// 화면에는 아무 일도 일어나지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  detectKind,
  groupKeyOf,
  mentionGroups,
  slotOf,
  type AttachmentSource,
  type MentionGroup,
  type PendingAttachment,
} from './pending-attachments';
import { uploadAttachment } from './upload';
import { audioArt, videoPoster } from './thumbnail';

/** 올라가는 중인 파일 하나. */
export interface UploadTask {
  id: string;
  name: string;
  size: number;
  /** 0~1 */
  progress: number;
  /** 로컬에서 미리 뽑아 둔 그림 — 올라가는 동안에도 무엇을 붙였는지 보인다 */
  previewUrl?: string;
  artUrl?: string;
  cancel: () => void;
}

/** 동시에 올릴 파일 수 — 회선을 나눠 쓰면 큰 파일 하나가 나머지를 막지 않는다. */
const UPLOAD_CONCURRENCY = 3;

export interface UploadRequest {
  file: File;
  /** 표시 이름 — 프로젝트 가져오기는 폴더 안 경로를 그대로 쓴다 */
  name?: string;
}

export interface AttachmentSlots {
  files: PendingAttachment[];
  /** 썸네일 캐러셀에 눕는 것 — 업로드한 파일·Drive */
  thumbs: PendingAttachment[];
  /** 입력창 본문 안에 앉는 것 — GitHub·Local 프로젝트·URL */
  mentions: PendingAttachment[];
  /** 멘션을 덩어리로 묶은 것 — 저장소 하나가 칩 하나다 */
  mentionGroups: MentionGroup[];
  /** 올라가는 중인 파일 */
  tasks: UploadTask[];
  /** 하나라도 올라가는 중인가 */
  uploading: boolean;
  add: (added: PendingAttachment[]) => void;
  /** 파일을 올려 첨부로 만든다 — 진행률과 취소는 tasks로 나온다 */
  upload: (requests: UploadRequest[], source: AttachmentSource, group?: string) => Promise<void>;
  remove: (file: PendingAttachment) => void;
  /** 덩어리 하나를 통째로 지운다 — 저장소를 지우면 그 파일 전부가 빠진다 */
  removeGroup: (group: MentionGroup) => void;
  clear: () => void;
}

export function useAttachmentSlots({
  onNotice,
}: { onNotice?: (message: string | null) => void } = {}): AttachmentSlots {
  const [files, setFiles] = useState<PendingAttachment[]>([]);
  const [tasks, setTasks] = useState<UploadTask[]>([]);

  const thumbs = useMemo(() => files.filter((file) => slotOf(file) === 'thumb'), [files]);
  const mentions = useMemo(() => files.filter((file) => slotOf(file) === 'mention'), [files]);
  const groups = useMemo(() => mentionGroups(mentions), [mentions]);

  // 화면을 떠날 때 objectURL을 한 번에 푼다.
  // (files를 의존성에 넣으면 두 번째 파일을 붙이는 순간 첫 번째 미리보기가 해제돼
  //  썸네일이 깨진다. 그래서 최신 목록을 ref로만 따라간다.)
  const latest = useRef<{ files: PendingAttachment[]; tasks: UploadTask[] }>({ files, tasks });
  useEffect(() => {
    latest.current = { files, tasks };
  }, [files, tasks]);
  useEffect(
    () => () => {
      const revoke = (url?: string) => url?.startsWith('blob:') && URL.revokeObjectURL(url);
      latest.current.files.forEach((file) => {
        revoke(file.previewUrl);
        revoke(file.artUrl);
      });
      // 화면을 떠나면 올라가던 것도 멈춘다 — 돌아올 화면이 없는 업로드를 끌고 갈 이유가 없다
      latest.current.tasks.forEach((task) => task.cancel());
    },
    [],
  );

  const add = useCallback((added: PendingAttachment[]) => {
    setFiles((prev) => [...prev, ...added]);
  }, []);

  const upload = useCallback(
    async (requests: UploadRequest[], source: AttachmentSource, group?: string) => {
      if (requests.length === 0) return;

      const queue = requests.map((request) => ({
        ...request,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        controller: new AbortController(),
      }));

      setTasks((prev) => [
        ...prev,
        ...queue.map((entry) => ({
          id: entry.id,
          name: entry.name ?? entry.file.name,
          size: entry.file.size,
          progress: 0,
          cancel: () => entry.controller.abort(),
        })),
      ]);

      const failures: string[] = [];
      let cursor = 0;

      async function runOne(entry: (typeof queue)[number]) {
        const name = entry.name ?? entry.file.name;
        const kind = detectKind(name, entry.file.type);

        // 썸네일은 업로드와 **동시에** 뽑는다. 끝나기를 기다렸다 뽑으면 그만큼 늦어지고,
        // 올라가는 동안 카드가 비어 있어 무엇을 붙였는지 보이지 않는다.
        const thumbnail = (async () => {
          const [previewUrl, art] = await Promise.all([
            kind === 'image'
              ? Promise.resolve(URL.createObjectURL(entry.file))
              : /\.(mp4|webm)$/i.test(name)
                ? videoPoster(entry.file)
                : Promise.resolve(null),
            /\.(mp3|wav)$/i.test(name) ? audioArt(entry.file) : Promise.resolve(null),
          ]);
          // 뽑히는 대로 카드에 붙인다
          setTasks((prev) =>
            prev.map((task) =>
              task.id === entry.id
                ? { ...task, previewUrl: previewUrl ?? undefined, artUrl: art ?? undefined }
                : task,
            ),
          );
          return { previewUrl, art };
        })();

        const result = await uploadAttachment(entry.file, {
          signal: entry.controller.signal,
          onProgress: (ratio) =>
            setTasks((prev) =>
              prev.map((task) => (task.id === entry.id ? { ...task, progress: ratio } : task)),
            ),
        });

        const { previewUrl, art } = await thumbnail;
        setTasks((prev) => prev.filter((task) => task.id !== entry.id));

        if ('error' in result) {
          // 취소는 실패가 아니다 — 이용자가 스스로 멈춘 것이라 알릴 것이 없다
          if (!result.canceled) failures.push(`"${name}" ${result.error}`);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          if (art) URL.revokeObjectURL(art);
          return;
        }

        // 끝난 것부터 목록에 넣는다 — 다 끝나기를 기다렸다 한꺼번에 넣으면
        // 큰 파일 하나 때문에 작은 파일들까지 보이지 않는다
        const attachment: PendingAttachment = {
          kind,
          name,
          url: result.url,
          mime: entry.file.type || undefined,
          size: entry.file.size,
          source,
          group,
          previewUrl: previewUrl ?? undefined,
          artUrl: art ?? undefined,
        };
        setFiles((prev) => [...prev, attachment]);
      }

      // 정해진 수만큼만 동시에 돌린다
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, async () => {
          while (cursor < queue.length) {
            const entry = queue[cursor];
            cursor += 1;
            await runOne(entry);
          }
        }),
      );

      if (failures.length > 0) {
        onNotice?.(failures.length === 1 ? failures[0] : `${failures.length}개 파일을 올리지 못했습니다. ${failures[0]}`);
      }
    },
    [onNotice],
  );

  // 인덱스가 아니라 객체로 지운다 — 두 자리로 갈라 그리므로 인덱스가 서로 어긋난다
  const remove = useCallback((file: PendingAttachment) => {
    setFiles((prev) => prev.filter((entry) => entry !== file));
  }, []);

  const removeGroup = useCallback((group: MentionGroup) => {
    setFiles((prev) => prev.filter((file) => groupKeyOf(file) !== group.key));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  return {
    files,
    thumbs,
    mentions,
    mentionGroups: groups,
    tasks,
    uploading: tasks.length > 0,
    add,
    upload,
    remove,
    removeGroup,
    clear,
  };
}
