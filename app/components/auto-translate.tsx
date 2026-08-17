'use client';

// 전역 자동 번역기 — 앱 설정 언어가 EN이면 화면의 한국어 텍스트를 그 자리에서 영어로 바꾼다.
//
// 번역문을 따로 덧붙이지 않는다. 텍스트 노드의 내용 자체를 교체하므로 게시글 본문도, 댓글·답글도
// 원래 자리에서 영어로 읽힌다. 구조는 건드리지 않아 React 트리와 충돌하지 않고, 리렌더로 원문이
// 돌아오거나 댓글이 새로 붙으면 MutationObserver가 이어서 번역한다.
// KO로 돌아오면 저장해 둔 원문으로 복원하고, 번역 결과는 localStorage에 캐시된다.
import { useEffect, useRef } from 'react';
import { useLanguage } from '@/app/context/language-context';

const HAS_KOREAN = /[가-힣]/;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'NOSCRIPT', 'KBD', 'SAMP']);
// 사람 이름·아이디처럼 옮기면 안 되는 것은 data-no-translate로 표시한다(아래 eligible 참조).
// 여기에 더해 글자 하나짜리 노드는 애초에 건너뛴다 — 아바타에 찍히는 이름 첫 글자가
// 단어로 번역돼 엉뚱한 알파벳이 박히던 일을 막는다.
const MIN_LENGTH = 2;
const CACHE_PREFIX = 'dc:tx:';
const BATCH_SIZE = 40;
// 서버가 한 건당 600자를 넘기지 못한다. 긴 문단은 문장 경계로 잘라 보내고 다시 이어 붙인다.
const MAX_UNIT = 600;

function cacheGet(src: string): string | null {
  try {
    return window.localStorage.getItem(CACHE_PREFIX + src);
  } catch {
    return null;
  }
}

function cacheSet(src: string, translated: string) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + src, translated);
  } catch {
    // 캐시 가득참 — 무시 (번역은 메모리로만 유지)
  }
}

/**
 * 긴 문단을 번역 단위로 쪼갠다 — 문장 끝(. ! ? 및 줄바꿈)에서 끊고, 그래도 남으면 길이로 자른다.
 * 조각을 그대로 이어 붙이면 원문이 되므로 번역문도 같은 순서로 이으면 문단이 복원된다.
 */
function splitUnits(text: string): string[] {
  if (text.length <= MAX_UNIT) return [text];
  const units: string[] = [];
  let buffer = '';
  // 문장 부호와 줄바꿈 뒤에서 끊는다(구분자는 앞 조각에 남긴다)
  for (const piece of text.split(/(?<=[.!?。？!]\s|\n)/)) {
    if (buffer && buffer.length + piece.length > MAX_UNIT) {
      units.push(buffer);
      buffer = '';
    }
    // 한 조각이 이미 상한을 넘으면 길이로 강제 분할한다
    if (piece.length > MAX_UNIT) {
      if (buffer) {
        units.push(buffer);
        buffer = '';
      }
      for (let i = 0; i < piece.length; i += MAX_UNIT) units.push(piece.slice(i, i + MAX_UNIT));
      continue;
    }
    buffer += piece;
  }
  if (buffer) units.push(buffer);
  return units;
}

function eligible(node: Text): boolean {
  const text = node.nodeValue;
  // 상한은 두지 않는다 — 긴 본문은 splitUnits가 나눠서 보낸다
  if (!text || !HAS_KOREAN.test(text) || text.trim().length < MIN_LENGTH) return false;
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName) || el.hasAttribute('data-no-translate')) return false;
    if (el === document.body) break;
  }
  return true;
}

function collectTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (eligible(n as Text)) out.push(n as Text);
  }
  return out;
}

export default function AutoTranslate() {
  const { language } = useLanguage();
  // 번역 적용된 노드 → { src(원문), out(번역문) } — 복원과 재번역 루프 방지에 쓴다
  const applied = useRef(new WeakMap<Text, { src: string; out: string }>());
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    if (language !== 'en') return;
    let cancelled = false;

    /**
     * 원문 → 번역문 지도.
     *
     * 긴 문단은 조각으로 나눠 보내고 같은 순서로 이어 붙여 되돌린다. 캐시는 조각 단위라
     * 같은 문장이 여러 글에 나와도 한 번만 번역한다.
     */
    async function translateAll(sources: string[]): Promise<Map<string, string>> {
      const unitsBySource = new Map(sources.map((s) => [s, splitUnits(s)]));
      const translated = await translateUnits([...new Set([...unitsBySource.values()].flat())]);
      const out = new Map<string, string>();
      for (const [source, units] of unitsBySource) {
        const joined = units.map((u) => translated.get(u) ?? u).join('');
        if (joined !== source) out.set(source, joined);
      }
      return out;
    }

    async function translateUnits(texts: string[]): Promise<Map<string, string>> {
      const result = new Map<string, string>();
      const need: string[] = [];
      for (const t of texts) {
        const hit = cacheGet(t);
        if (hit) result.set(t, hit);
        else if (!inflight.current.has(t)) need.push(t);
      }
      for (let i = 0; i < need.length; i += BATCH_SIZE) {
        const chunk = need.slice(i, i + BATCH_SIZE);
        chunk.forEach((t) => inflight.current.add(t));
        try {
          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: chunk }),
          });
          if (res.ok) {
            const data = (await res.json()) as { translations?: string[] };
            if (Array.isArray(data.translations) && data.translations.length === chunk.length) {
              chunk.forEach((src, j) => {
                const out = data.translations![j];
                result.set(src, out);
                if (out !== src) cacheSet(src, out);
              });
            }
          }
        } catch {
          // 네트워크 실패 — 원문 유지
        } finally {
          chunk.forEach((t) => inflight.current.delete(t));
        }
      }
      return result;
    }

    async function run(root: Node) {
      const nodes = collectTextNodes(root).filter((n) => {
        const rec = applied.current.get(n);
        return !(rec && n.nodeValue === rec.out); // 이미 번역된 그대로면 건너뛴다
      });
      if (nodes.length === 0) return;
      const uniq = [...new Set(nodes.map((n) => n.nodeValue!.trim()).filter(Boolean))];
      const map = await translateAll(uniq);
      if (cancelled) return;
      for (const n of nodes) {
        const raw = n.nodeValue;
        if (!raw) continue;
        const trimmed = raw.trim();
        const out = map.get(trimmed);
        if (!out || out === trimmed) continue;
        const replaced = raw.replace(trimmed, out); // 앞뒤 공백 보존
        applied.current.set(n, { src: raw, out: replaced });
        n.nodeValue = replaced;
      }
    }

    run(document.body);

    // 리렌더/네비게이션으로 새로 생긴(또는 원문으로 되돌아간) 한국어 노드를 재번역.
    //
    // 바뀐 가지만 훑는다. 예전에는 어떤 변화든 document.body 전체를 다시 걸었는데, 에디터처럼
    // 노드가 끊임없이 바뀌는 화면에서는 그 순회 자체가 부담이었다. 바뀐 곳이 너무 많으면
    // 가지별로 도는 것이 오히려 손해라 그때만 전체로 돌린다.
    const MAX_ROOTS = 24;
    let timer: number | undefined;
    let dirty = new Set<Node>();

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        // characterData의 target은 Text 노드다 — TreeWalker는 루트 자신을 돌려주지 않으므로
        // 그 부모를 담는다
        if (record.type === 'characterData') dirty.add(record.target.parentNode ?? record.target);
        else if (record.addedNodes.length > 0) dirty.add(record.target);
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const roots = dirty.size > MAX_ROOTS ? [document.body] : [...dirty];
        dirty = new Set();
        // 번역이 스크롤·입력을 밀어내지 않도록 한가한 틈에 돌린다
        for (const root of roots) {
          if (root.isConnected) void run(root);
        }
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const appliedMap = applied.current;
    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      // KO 복귀 — 번역 상태 그대로인 노드만 원문으로 되돌린다
      for (const n of collectAllText(document.body)) {
        const rec = appliedMap.get(n);
        if (rec && n.nodeValue === rec.out) n.nodeValue = rec.src;
      }
    };
  }, [language]);

  return null;
}

function collectAllText(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}
