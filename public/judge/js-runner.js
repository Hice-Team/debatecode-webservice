// debateCode JS 채점 워커
// 프로토콜: {type:'run', code, cases:[{id,args,expected}]} 수신 →
//   케이스별 {type:'case-result', ...} 스트리밍 → {type:'done', passed, total}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-9 || a === b;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

self.onmessage = function (e) {
  const msg = e.data;
  if (msg.type !== 'run') return;

  let solution;
  try {
    solution = new Function('"use strict";\n' + msg.code + '\n;return solution;')();
    if (typeof solution !== 'function') {
      throw new Error('solution 함수를 찾을 수 없습니다. 함수 이름을 확인하세요.');
    }
  } catch (err) {
    for (const c of msg.cases) {
      self.postMessage({
        type: 'case-result',
        id: c.id,
        status: 'error',
        stdout: '',
        timeMs: 0,
        errorMessage: String(err && err.message ? err.message : err),
      });
    }
    self.postMessage({ type: 'done', passed: 0, total: msg.cases.length });
    return;
  }

  let passed = 0;
  for (const c of msg.cases) {
    let stdoutBuf = [];
    const origLog = console.log;
    console.log = function () {
      stdoutBuf.push(Array.prototype.map.call(arguments, function (a) {
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
      }).join(' '));
    };

    const start = performance.now();
    try {
      // 사용자 코드가 인자를 변형할 수 있으므로 케이스별 딥카피 전달
      const args = JSON.parse(JSON.stringify(c.args));
      const actual = solution.apply(null, args);
      const timeMs = performance.now() - start;
      const ok = deepEqual(actual, c.expected);
      if (ok) passed++;
      self.postMessage({
        type: 'case-result',
        id: c.id,
        status: ok ? 'pass' : 'fail',
        actual: actual === undefined ? null : actual,
        expected: c.expected,
        stdout: stdoutBuf.join('\n'),
        timeMs: Math.round(timeMs * 100) / 100,
      });
    } catch (err) {
      self.postMessage({
        type: 'case-result',
        id: c.id,
        status: 'error',
        stdout: stdoutBuf.join('\n'),
        timeMs: Math.round((performance.now() - start) * 100) / 100,
        errorMessage: String(err && err.message ? err.message : err),
      });
    } finally {
      console.log = origLog;
    }
  }

  self.postMessage({ type: 'done', passed: passed, total: msg.cases.length });
};

self.postMessage({ type: 'ready' });
