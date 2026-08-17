-- 익명 식별자 + 등급 배지 노출 정책
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "anonymousTag" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_anonymousTag_key" ON "User"("anonymousTag");

-- 게시판 규칙: 익명글 / 비밀글 / 인증 답변 전용 / 답변 채택
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "anonymous" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "secret" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "verifiedOnlyReplies" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "adoptedCommentId" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "adoptedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Post_adoptedCommentId_key" ON "Post"("adoptedCommentId");

ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "anonymous" BOOLEAN NOT NULL DEFAULT false;

-- 기존 문의게시판 글은 비밀글 정책 대상이므로 소급 적용한다
UPDATE "Post" SET "secret" = true WHERE "board" = 'qna' AND "secret" = false;

-- 기존 사용자 익명 식별자 백필 — Anonymous + 2~4자리 난수. 충돌 시 남은 행은 다음 실행에서 채워진다.
UPDATE "User"
SET "anonymousTag" = 'Anonymous ' || (10 + floor(random() * 9990))::int
WHERE "anonymousTag" IS NULL;
