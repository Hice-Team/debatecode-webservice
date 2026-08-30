-- AI 개인 설정 — 검색 기본 모델, 개별 지침, 맥락 양.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiSearchModel" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiInstructions" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiContextMode" TEXT;
