-- 디베이트포인트와 등급 점수를 하나로 합친다.
--
-- 예전에는 같은 사건(문제 통과)에서 두 숫자가 각자 쌓였다.
--   원장(PointLedger)  난이도 × 통과율
--   User.starScore     정답률×35 + 난이도×3.75
-- 두 값이 같은 활동을 세면서 서로 다른 결과를 말하니, 화면에서 "포인트"와 "등급 점수"가
-- 왜 다른지 설명할 방법이 없었다.
--
-- 이제 원장이 유일한 진실이고 starScore는 그 합계를 들고 있는 캐시다.
-- 여기서는 지금까지 쌓인 원장을 다시 합산해 starScore를 새로 새긴다.
--
-- 조정(adjustPoints)으로 합계가 음수가 될 수 있지만 등급 점수는 0 아래로 내려가지 않는다.
UPDATE "User" u
SET "starScore" = GREATEST(0, COALESCE((
  SELECT SUM(l."amount") FROM "PointLedger" l WHERE l."userId" = u."id"
), 0));
