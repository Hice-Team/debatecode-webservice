-- 설정 화면 확장 — 시간·지역 표기, 에디터 기본값, 알림 채널, 개인 맞춤.
--
-- 모두 NULL 허용이거나 기본값이 있다. 이미 있는 계정을 건드리지 않고 붙는다는 뜻이다.
-- profileVisibility만 NOT NULL인데, "정하지 않음"과 "공개"를 구분할 이유가 없어서다 —
-- 공개 범위는 비어 있을 수 없는 값이다.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dateFormat" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "editorPrefs" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyPrefs" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileGoal" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileVisibility" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatLanguage" TEXT;
