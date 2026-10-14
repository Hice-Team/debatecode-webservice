-- 학습(코스웨어) · AI Search · 상점 제거.
--
-- 되돌릴 수 없다. 지우기 전에 받아 둔 덤프는 prisma/backups/20260901_pre_drop.json 에 있다.
--
-- 남기는 것
--   AiUsageCounter  debateAI(문제 풀이 중 질문)가 계속 쓴다
--   PointLedger     포인트는 상점 화폐가 아니라 랭킹 기여도로 남는다
--   PointRequest    활동 인증 심사는 그대로다

-- 자식 → 부모 순서. FK가 걸려 있어 반대로 지우면 막힌다.
DROP TABLE IF EXISTS "AiMessage"      CASCADE;
DROP TABLE IF EXISTS "AiFeedback"     CASCADE;
DROP TABLE IF EXISTS "AiSession"      CASCADE;
DROP TABLE IF EXISTS "AiFolder"       CASCADE;

DROP TABLE IF EXISTS "LessonProgress" CASCADE;
DROP TABLE IF EXISTS "Lesson"         CASCADE;
DROP TABLE IF EXISTS "Course"         CASCADE;

DROP TABLE IF EXISTS "ShopOrder"      CASCADE;
DROP TABLE IF EXISTS "ShopProduct"    CASCADE;

-- AI Search에서만 쓰던 개인 설정 컬럼
ALTER TABLE "User" DROP COLUMN IF EXISTS "aiSearchModel";
