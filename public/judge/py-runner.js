// debateCode Python 실행 워커 (Pyodide)
// 첫 로드 시 CDN에서 ~6MB wasm을 받아오므로 {type:'ready'}가 늦게 옵니다.
//
// 이 워커는 **채점하지 않는다.** 코드를 돌려 각 케이스가 무엇을 돌려주었는지만 보고한다.
// 판정은 서버가 한다(app/lib/judge/server.ts). 기대 출력은 워커까지 내려오지 않는다.

var PYODIDE_VERSION = 'v0.26.4';
importScripts('https://cdn.jsdelivr.net/pyodide/' + PYODIDE_VERSION + '/full/pyodide.js');

var pyodideReadyPromise = loadPyodide({
  indexURL: 'https://cdn.jsdelivr.net/pyodide/' + PYODIDE_VERSION + '/full/',
}).then(function (py) {
  self.postMessage({ type: 'ready' });
  return py;
}).catch(function (err) {
  self.postMessage({
    type: 'worker-error',
    errorMessage: String(err && err.message ? err.message : err),
  });
  throw err;
});

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

/** 구조화 복제(postMessage)로 보낼 수 있는 형태로 좁힌다. */
function toTransferable(value, depth) {
  depth = depth || 0;
  if (value === undefined || value === null) return null;
  var t = typeof value;
  if (t === 'number') return isFinite(value) ? value : String(value);
  if (t === 'boolean') return value;
  if (t === 'bigint') return Number(value);
  if (t === 'string') return value.length > 20000 ? value.slice(0, 20000) : value;
  if (t === 'function' || t === 'symbol') return null;
  if (depth >= 12) return null;
  if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length && i < 5000; i++) arr.push(toTransferable(value[i], depth + 1));
    return arr;
  }
  if (t === 'object') {
    var o = {};
    var keys = Object.keys(value).slice(0, 5000);
    for (var j = 0; j < keys.length; j++) o[keys[j]] = toTransferable(value[keys[j]], depth + 1);
    return o;
  }
  return null;
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
          type: 'case-outcome',
          id: msg.cases[i].id,
          outcome: 'error',
          stdout: stdoutBuf.join('\n'),
          timeMs: 0,
          errorMessage: String(err && err.message ? err.message : err),
        });
      }
      self.postMessage({ type: 'done', total: msg.cases.length });
      return;
    }

    for (var j = 0; j < msg.cases.length; j++) {
      var c = msg.cases[j];
      stdoutBuf = [];
      pyodide.setStdout({
        batched: (function (buf) {
          return function (line) { buf.push(line); };
        })(stdoutBuf),
      });

      var start = performance.now();
      try {
        var pyArgs = c.args.map(function (a) { return pyodide.toPy(a); });
        var rawResult = solution.apply(null, pyArgs);
        pyArgs.forEach(function (a) { if (a && typeof a.destroy === 'function') a.destroy(); });
        var actual = toPlain(rawResult);
        var timeMs = performance.now() - start;
        self.postMessage({
          type: 'case-outcome',
          id: c.id,
          outcome: 'returned',
          actual: toTransferable(actual),
          stdout: stdoutBuf.join('\n'),
          timeMs: Math.round(timeMs * 100) / 100,
        });
      } catch (err) {
        self.postMessage({
          type: 'case-outcome',
          id: c.id,
          outcome: 'error',
          stdout: stdoutBuf.join('\n'),
          timeMs: Math.round((performance.now() - start) * 100) / 100,
          errorMessage: String(err && err.message ? err.message : err),
        });
      }
    }

    if (solution && typeof solution.destroy === 'function') solution.destroy();
    self.postMessage({ type: 'done', total: msg.cases.length });
  });
};
