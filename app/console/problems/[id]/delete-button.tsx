'use client';

// 문제 삭제 — 제목을 그대로 입력해야 활성화된다.
// 되돌릴 수 없는 조치라, 클릭 한 번으로 넘어가지 않게 한 단계를 둔다.
import { useState } from 'react';
import { FIELD } from '../../ui';

export default function DeleteProblemButton({
  id,
  title,
  action,
}: {
  id: number;
  title: string;
  action: (formData: FormData) => void;
}) {
  const [typed, setTyped] = useState('');
  const ready = typed.trim() === title.trim();

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        aria-label="삭제 확인을 위해 문제 제목 입력"
        placeholder={`확인을 위해 "${title}" 입력`}
        className={`${FIELD} max-w-xs`}
      />
      <button
        type="submit"
        disabled={!ready}
        className="shrink-0 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
      >
        영구 삭제
      </button>
    </form>
  );
}
