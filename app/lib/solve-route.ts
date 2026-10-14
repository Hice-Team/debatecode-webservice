/**
 * 문제 풀이 워크스페이스(코드 에디터) 경로인지.
 *
 * 이 판단을 화면마다 따로 적어 두면 언젠가 어긋난다 — 실제로 상단 배너는 빠지는데
 * 내비게이션은 흰색으로 남는 식이었다. 한 곳에서 정하고 모두가 가져다 쓴다.
 *
 * 목록(/problems)·작성(/problems/new)·수정(/problems/1/edit)은 해당하지 않는다.
 * 워크스페이스만 숫자 하나로 끝난다.
 */
const SOLVE_WORKSPACE = /^\/problems\/\d+$/;

export function isSolveWorkspace(pathname: string): boolean {
  return SOLVE_WORKSPACE.test(pathname);
}
