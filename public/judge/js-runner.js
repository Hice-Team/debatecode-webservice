// debateCode JS 실행 워커
//
// 이 워커는 **채점하지 않는다.** 코드를 돌려 각 케이스가 무엇을 돌려주었는지만 보고한다.
// 맞았는지 틀렸는지는 서버가 정한다(app/lib/judge/server.ts) — 브라우저에 판정을 맡기면
// 그 판정은 이용자가 정하는 값이 되고, 거기에 점수와 포인트가 걸려 있었다.
// 그래서 기대 출력(expected)은 이제 워커까지 내려오지 않는다.
//
// 프로토콜:
//   수신 {type:'run', code, cases:[{id, args}], timeLimitMs}
//   송신 {type:'case-outcome', id, outcome:'returned'|'error', actual?, stdout, timeMs, errorMessage?}
//        {type:'done', total}

/** 반환값을 구조화 복제(postMessage)로 보낼 수 있는 형태로 좁힌다. */
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
  if (value instanceof Map) {
    var m = {};
    var mi = 0;
    value.forEach(function (v, k) {
      if (mi++ < 5000) m[String(k)] = toTransferable(v, depth + 1);
    });
    return m;
  }
  if (value instanceof Set) {
    return toTransferable(Array.from(value), depth);
  }
  if (t === 'object') {
    var o = {};
    var keys = Object.keys(value).slice(0, 5000);
    for (var j = 0; j < keys.length; j++) o[keys[j]] = toTransferable(value[keys[j]], depth + 1);
    return o;
  }
  return null;
}

self.postMessage({ type: 'ready' });

self.onmessage = function (e) {
  var msg = e.data;
  if (msg.type !== 'run') return;

  var solution;
  try {
    solution = new Function('"use strict";\n' + msg.code + '\n;return solution;')();
    if (typeof solution !== 'function') {
      throw new Error('solution 함수를 찾을 수 없습니다. 함수 이름을 확인하세요.');
    }
  } catch (err) {
    for (var i = 0; i < msg.cases.length; i++) {
      self.postMessage({
        type: 'case-outcome',
        id: msg.cases[i].id,
        outcome: 'error',
        stdout: '',
        timeMs: 0,
        errorMessage: String(err && err.message ? err.message : err),
      });
    }
    self.postMessage({ type: 'done', total: msg.cases.length });
    return;
  }

  for (var k = 0; k < msg.cases.length; k++) {
    var c = msg.cases[k];
    var stdoutBuf = [];
    var origLog = console.log;
    console.log = function () {
      stdoutBuf.push(
        Array.prototype.map
          .call(arguments, function (a) {
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
          })
          .join(' '),
      );
    };

    var start = performance.now();
    try {
      // 사용자 코드가 인자를 변형할 수 있으므로 케이스별 딥카피 전달
      var args = JSON.parse(JSON.stringify(c.args));
      var actual = solution.apply(null, args);
      var timeMs = performance.now() - start;
      console.log = origLog;
      self.postMessage({
        type: 'case-outcome',
        id: c.id,
        outcome: 'returned',
        actual: toTransferable(actual),
        stdout: stdoutBuf.join('\n'),
        timeMs: Math.round(timeMs * 100) / 100,
      });
    } catch (err) {
      console.log = origLog;
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

  self.postMessage({ type: 'done', total: msg.cases.length });
};
