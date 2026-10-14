// 카탈로그에 있는 모델을 라우터가 실제로 서빙하는지 확인한다.
//
//   npx tsx --env-file=.env scripts/check-ai-models.mjs
//
// 라우터가 서빙하는 저장소는 수시로 바뀐다 — 어제 되던 모델이 오늘 400을 준다.
// 못 부르는 모델을 목록에 남겨 두면 이용자가 고른 모델과 답한 모델이 달라지는데,
// 폴백이 대신 답해 주니 화면은 멀쩡해 보이고 그래서 더 오래 들키지 않는다.
// 배포 전에 이 스크립트를 돌려 죽은 저장소를 먼저 발견한다.
import { FREE_AI_REPOS, FREE_FALLBACK_REPO } from '../app/lib/ai/free-ai-models';
import { SEARCH_MODELS } from '../app/lib/ai/search-models';

const key = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
if (!key) {
  console.error('HUGGINGFACE_API_KEY가 없습니다.');
  process.exit(1);
}

/** 모델 id → 저장소. 검색 카탈로그와 debateAI 카탈로그를 합쳐서 본다. */
const targets = new Map();
for (const [id, repo] of Object.entries(FREE_AI_REPOS)) targets.set(repo, [...(targets.get(repo) ?? []), id]);
for (const m of SEARCH_MODELS) targets.set(m.repo, [...(targets.get(m.repo) ?? []), `search:${m.id}`]);
targets.set(FREE_FALLBACK_REPO, [...(targets.get(FREE_FALLBACK_REPO) ?? []), '(폴백)']);

const dead = [];
for (const [repo, ids] of targets) {
  const started = Date.now();
  let line;
  try {
    const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: repo, max_tokens: 8, messages: [{ role: 'user', content: 'hi' }] }),
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (res.ok) {
      line = `  ✓ ${repo}  (${secs}초)  ← ${ids.join(', ')}`;
    } else {
      const why = (await res.text()).replace(/\s+/g, ' ').slice(0, 110);
      line = `  ✗ ${repo}  HTTP ${res.status}  ← ${ids.join(', ')}\n      ${why}`;
      dead.push(repo);
    }
  } catch (e) {
    line = `  ✗ ${repo}  ${String(e.message).slice(0, 80)}  ← ${ids.join(', ')}`;
    dead.push(repo);
  }
  console.log(line);
}

console.log(`\n${targets.size - dead.length} / ${targets.size} 저장소 정상`);
if (dead.length) {
  console.log('\n죽은 저장소 — free-ai-models.ts와 debateai-models.ts에서 함께 빼야 합니다:');
  for (const r of dead) console.log(`  ${r}`);
}
process.exit(dead.length ? 1 : 0);
