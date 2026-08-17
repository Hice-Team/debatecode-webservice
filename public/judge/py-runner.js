// debateCode Python 채점 워커 (Pyodide)
// 첫 로드 시 CDN에서 ~6MB wasm을 받아오므로 {type:'ready'}가 늦게 옵니다.

var PYODIDE_VERSION = 'v0.26.4';
importScripts('https://cdn.jsdelivr.net/pyodide/' + PYODIDE_VERSION + '/full/pyodide.js');

var pyodideReadyPromise = loadPyodide({
  indexURL: 'https://cdn.jsdelivr.net/pyodide/' + PYODIDE_VERSION + '/full/',
}).then(function (py) {
  self.postMessage({ type: 'ready' });
  return py;
});

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-9 || a === b;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    var ka = Object.keys(a);
    var kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(function (k) { return deepEqual(a[k], b[k]); });
  }
  return false;
}

// Pyodide Proxy → 순수 JS 값 변환 (tuple→array, dict→object, int 유지)
function toPlain(value) {
  if (value && typeof value.toJs === 'function') {
    var js = value.toJs({ dict_converter: Object.fromEntries, create_proxies: false });
    if (typeof value.destroy === 'function') value.destroy();
    return toPlain(js);
  }
  if (value instanceof Map) return Object.fromEntries(value);
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'bigint') return Number(value);
  return value;
}

self.onmessage = function (e) {
  var msg = e.data;
  if (msg.type !== 'run') return;

  pyodideReadyPromise.then(function (pyodide) {
    var stdoutBuf = [];
    pyodide.setStdout({ batched: function (line) { stdoutBuf.push(line); } });
    pyodide.setStderr({ batched: function (line) { stdoutBuf.push(line); } });

    var solution = null;
    try {
      pyodide.runPython(msg.code);
      solution = pyodide.globals.get('solution');
      if (!solution) throw new Error('solution 함수를 찾을 수 없습니다. 함수 이름을 확인하세요.');
    } catch (err) {
      for (var i = 0; i < msg.cases.length; i++) {
        self.postMessage({
          type: 'case-result',
          id: msg.cases[i].id,
          status: 'error',
          stdout: stdoutBuf.join('\n'),
          timeMs: 0,
          errorMessage: String(err && err.message ? err.message : err),
        });
      }
      self.postMessage({ type: 'done', passed: 0, total: msg.cases.length });
      return;
    }

    var passed = 0;
    for (var j = 0; j < msg.cases.length; j++) {
      var c = msg.cases[j];
      stdoutBuf = [];
      pyodide.setStdout({ batched: (function (buf) { return function (line) { buf.push(line); }; })(stdoutBuf) });

      var start = performance.now();
      try {
        var pyArgs = c.args.map(function (a) { return pyodide.toPy(a); });
        var rawResult = solution.apply(null, pyArgs);
        pyArgs.forEach(function (a) { if (a && typeof a.destroy === 'function') a.destroy(); });
        var actual = toPlain(rawResult);
        var timeMs = performance.now() - start;
        var ok = deepEqual(actual, c.expected);
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
      }
    }

    if (solution && typeof solution.destroy === 'function') solution.destroy();
    self.postMessage({ type: 'done', passed: passed, total: msg.cases.length });
  });
};
