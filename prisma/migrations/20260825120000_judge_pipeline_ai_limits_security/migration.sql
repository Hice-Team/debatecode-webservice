-- 채점 파이프라인 서버화 · AI 회수 한도 · 2차 인증 저장 방식 정비
--
-- 이 파일은 순수 추가와 안전한 변환만 한다. `prisma db push`는 public.User -> auth.users
-- FK(트리거로 생성됨) 때문에 auth 스키마를 건드리려 하므로 쓰지 않는다
-- (prisma/manual-additive.sql 상단 주석 참고). 인덱스는 전부 IF NOT EXISTS라
-- 여러 번 돌려도 안전하다.

-- =============================================================
-- 1. 채점 세션 — 제출의 신뢰 근거
-- =============================================================
CREATE TABLE IF NOT EXISTS "JudgeSession" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "userId"     UUID,
  "problemId"  INTEGER NOT NULL,
  "language"   TEXT NOT NULL,
  "codeHash"   TEXT NOT NULL,
  "kind"       TEXT NOT NULL DEFAULT 'run',
  "caseIds"    JSONB NOT NULL DEFAULT '[]',
  "consumedAt" TIMESTAMP(3),
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JudgeSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "JudgeSession_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "JudgeSession_userId_createdAt_idx" ON "JudgeSession"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "JudgeSession_expiresAt_idx"        ON "JudgeSession"("expiresAt");

-- 만료·소비된 채점 세션 정리 (콘솔 › 시스템에서 호출)
CREATE OR REPLACE FUNCTION public.judge_session_sweep()
RETURNS INT
LANGUAGE plpgsql
AS $fn$
DECLARE n INT;
BEGIN
  DELETE FROM "JudgeSession" WHERE "expiresAt" <= (now() AT TIME ZONE 'utc') - interval '1 day';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$fn$;

-- =============================================================
-- 2. AI 사용 카운터 — 토큰이 아니라 횟수로 센다
-- =============================================================
CREATE TABLE IF NOT EXISTS "AiUsageCounter" (
  "id"      TEXT NOT NULL PRIMARY KEY,
  "userId"  UUID NOT NULL,
  "surface" TEXT NOT NULL,
  "scope"   TEXT NOT NULL DEFAULT '-',
  "count"   INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiUsageCounter_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiUsageCounter_userId_surface_scope_key" ON "AiUsageCounter"("userId", "surface", "scope");
CREATE INDEX IF NOT EXISTS "AiUsageCounter_resetAt_idx" ON "AiUsageCounter"("resetAt");

-- 사용량을 원자적으로 올리고 한도 초과 여부를 함께 돌려준다.
--
-- 애플리케이션에서 읽고-쓰면 동시에 들어온 두 요청이 같은 값을 읽어 둘 다 통과한다.
-- 한도를 두겠다면서 탭 두 개에 뚫리는 것은 의미가 없다. 창 만료 판정·증가·한도 비교를
-- 한 문장 안에서 끝낸다. (같은 이유로 만들어 둔 rate_limit_hit과 같은 방식이다.)
CREATE OR REPLACE FUNCTION public.ai_usage_hit(
  p_user_id UUID,
  p_surface TEXT,
  p_scope   TEXT,
  p_limit   INT,
  p_window_ms BIGINT
)
RETURNS TABLE (allowed BOOLEAN, current_count INT, reset_at TIMESTAMP(3))
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_now   TIMESTAMP(3) := (now() AT TIME ZONE 'utc');
  v_reset TIMESTAMP(3) := (now() AT TIME ZONE 'utc') + make_interval(secs => p_window_ms / 1000.0);
  v_count INT;
  v_at    TIMESTAMP(3);
BEGIN
  INSERT INTO "AiUsageCounter" ("id", "userId", "surface", "scope", "count", "resetAt")
  VALUES (gen_random_uuid()::text, p_user_id, p_surface, p_scope, 1, v_reset)
  ON CONFLICT ("userId", "surface", "scope") DO UPDATE
    SET "count"   = CASE WHEN "AiUsageCounter"."resetAt" <= v_now THEN 1       ELSE "AiUsageCounter"."count" + 1 END,
        "resetAt" = CASE WHEN "AiUsageCounter"."resetAt" <= v_now THEN v_reset ELSE "AiUsageCounter"."resetAt"   END
  RETURNING "count", "resetAt" INTO v_count, v_at;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, v_at;
END;
$fn$;

-- 되돌리기 — 호출이 실패했을 때 소비한 횟수를 돌려준다.
-- 모델이 답하지 못했는데 이용자의 하루 한도가 줄어들면 그건 이용자 잘못이 아니다.
CREATE OR REPLACE FUNCTION public.ai_usage_refund(
  p_user_id UUID,
  p_surface TEXT,
  p_scope   TEXT
)
RETURNS VOID
LANGUAGE sql
AS $fn$
  UPDATE "AiUsageCounter"
     SET "count" = GREATEST(0, "count" - 1)
   WHERE "userId" = p_user_id AND "surface" = p_surface AND "scope" = p_scope
     AND "resetAt" > (now() AT TIME ZONE 'utc');
$fn$;

-- 소비하지 않고 남은 횟수만 본다 — 화면에 "오늘 n회 남음"을 그릴 때.
CREATE OR REPLACE FUNCTION public.ai_usage_peek(
  p_user_id UUID,
  p_surface TEXT,
  p_scope   TEXT
)
RETURNS TABLE (current_count INT, reset_at TIMESTAMP(3))
LANGUAGE sql
AS $fn$
  SELECT
    CASE WHEN c."resetAt" <= (now() AT TIME ZONE 'utc') THEN 0 ELSE c."count" END,
    c."resetAt"
  FROM "AiUsageCounter" c
  WHERE c."userId" = p_user_id AND c."surface" = p_surface AND c."scope" = p_scope;
$fn$;

CREATE OR REPLACE FUNCTION public.ai_usage_sweep()
RETURNS INT
LANGUAGE plpgsql
AS $fn$
DECLARE n INT;
BEGIN
  DELETE FROM "AiUsageCounter" WHERE "resetAt" <= (now() AT TIME ZONE 'utc') - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$fn$;

-- =============================================================
-- 3. 2차 인증 — 백업 코드는 해시로, 보안키는 credentialId를 컬럼으로
-- =============================================================
-- 백업 코드: 되돌릴 수 있는 암호문으로 저장하던 것을 sha256으로 바꾼다.
-- 기존 행은 평문을 복원할 수 없으므로(그리고 복원해서도 안 되므로) 버린다.
-- 이용자는 설정에서 다시 발급받는다 — 재발급은 원래도 언제든 가능한 동작이다.
DELETE FROM "BackupCode";
ALTER TABLE "BackupCode" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
ALTER TABLE "BackupCode" DROP COLUMN IF EXISTS "code";
ALTER TABLE "BackupCode" ADD COLUMN IF NOT EXISTS "codeHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BackupCode" ALTER COLUMN "codeHash" DROP DEFAULT;
ALTER TABLE "BackupCode" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "BackupCode_codeHash_key" ON "BackupCode"("codeHash");
CREATE INDEX IF NOT EXISTS "BackupCode_userId_used_idx" ON "BackupCode"("userId", "used");

-- 보안키: credential JSON에 묻혀 있던 값을 컬럼으로 올린다.
-- 이 값이 JSON 안에 있으면 (1) 중복 등록을 막는 excludeCredentials가 엉뚱한 값을 넘기고
-- (실제로 행 UUID를 넘기고 있었다) (2) 인증 단계에서 credential로 키를 찾을 수 없다.
ALTER TABLE "WebauthnKey" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
ALTER TABLE "WebauthnKey" ADD COLUMN IF NOT EXISTS "credentialId" TEXT;
ALTER TABLE "WebauthnKey" ADD COLUMN IF NOT EXISTS "publicKey" TEXT;
ALTER TABLE "WebauthnKey" ADD COLUMN IF NOT EXISTS "counter" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WebauthnKey" ADD COLUMN IF NOT EXISTS "transports" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WebauthnKey" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'WebauthnKey' AND column_name = 'credential'
  ) THEN
    UPDATE "WebauthnKey"
       SET "credentialId" = COALESCE("credentialId", "credential"::jsonb ->> 'credentialID'),
           "publicKey"    = COALESCE("publicKey",    "credential"::jsonb ->> 'publicKey')
     WHERE "credential" IS NOT NULL
       AND left(btrim("credential"), 1) = '{';
  END IF;
END
$mig$;

-- 옮길 수 없는 행은 버린다. 어차피 인증에 쓰인 적이 없다(인증 경로 자체가 없었다).
DELETE FROM "WebauthnKey" WHERE "credentialId" IS NULL OR "publicKey" IS NULL;
ALTER TABLE "WebauthnKey" ALTER COLUMN "credentialId" SET NOT NULL;
ALTER TABLE "WebauthnKey" ALTER COLUMN "publicKey" SET NOT NULL;
ALTER TABLE "WebauthnKey" DROP COLUMN IF EXISTS "credential";
CREATE UNIQUE INDEX IF NOT EXISTS "WebauthnKey_credentialId_key" ON "WebauthnKey"("credentialId");
CREATE INDEX IF NOT EXISTS "WebauthnKey_userId_idx" ON "WebauthnKey"("userId");

-- 챌린지 만료 — 값이 없으면 한 번 발급된 챌린지가 영원히 유효하다
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "webauthnChallengeAt" TIMESTAMP(3);

-- =============================================================
-- 3-2. 이메일 인증 — "확인했다"를 실제로 기록할 자리
--
--   가입은 admin.createUser({email_confirm:true})로 계정을 즉시 확정한다. 그래서
--   auth.users.email_confirmed_at은 **모든 계정에서 항상 채워져 있고**, 그것을 인증 근거로
--   쓰던 자리(중고거래 판매자 배지 · 멘토게시판의 인증 계정 전용 답변)는 전원 통과 상태였다.
--   게다가 "인증 메일 보내기" 버튼은 그 값을 먼저 보고 "이미 인증된 이메일입니다"만 돌려줘
--   메일을 한 통도 보내지 않았다 — 이용자에게는 발송 실패로 보인다.
--
--   실제로 확인한 시각을 따로 둔다. 기존 계정은 확인한 적이 없으므로 NULL로 남긴다.
-- =============================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

-- 소셜 로그인 계정은 제공자가 이미 주소를 확인했다 — 그 사실을 옮겨 온다.
UPDATE "User" u
   SET "emailVerifiedAt" = a.confirmed
  FROM (
    SELECT i.user_id, MIN(u2.email_confirmed_at) AS confirmed
      FROM auth.identities i
      JOIN auth.users u2 ON u2.id = i.user_id
     WHERE i.provider <> 'email'
     GROUP BY i.user_id
  ) a
 WHERE u.id = a.user_id AND u."emailVerifiedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "User_emailVerifiedAt_idx" ON "User"("emailVerifiedAt");

-- =============================================================
-- 4. 외래키 인덱스 — Postgres는 자동으로 만들어 주지 않는다
-- =============================================================
CREATE INDEX IF NOT EXISTS "TestCase_problemId_order_idx"          ON "TestCase"("problemId", "order");
CREATE INDEX IF NOT EXISTS "Submission_problemId_status_idx"       ON "Submission"("problemId", "status");
CREATE INDEX IF NOT EXISTS "InterviewSession_userId_createdAt_idx" ON "InterviewSession"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DebateQSession_problemId_idx"          ON "DebateQSession"("problemId");
CREATE INDEX IF NOT EXISTS "Post_authorId_createdAt_idx"           ON "Post"("authorId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Comment_authorId_createdAt_idx"        ON "Comment"("authorId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PostLike_userId_idx"                   ON "PostLike"("userId");
CREATE INDEX IF NOT EXISTS "PollVote_userId_idx"                   ON "PollVote"("userId");
CREATE INDEX IF NOT EXISTS "Bookmark_problemId_idx"                ON "Bookmark"("problemId");
CREATE INDEX IF NOT EXISTS "LessonProgress_lessonId_idx"           ON "LessonProgress"("lessonId");
CREATE INDEX IF NOT EXISTS "ProblemDraft_authorId_createdAt_idx"   ON "ProblemDraft"("authorId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ShopOrder_productId_idx"               ON "ShopOrder"("productId");

-- =============================================================
-- 5. 개인 데이터 관계 CASCADE 통일
--
--    지금까지는 관계마다 정책이 갈렸다 — RunAttempt는 Cascade인데 Submission은 RESTRICT,
--    Workbook은 Cascade인데 Bookmark는 RESTRICT. 그래서 탈퇴 코드가 삭제 순서를
--    외우고 있어야 했고, 모델을 하나 추가할 때마다 그 목록을 함께 고쳐야 했다.
--    빠뜨리면 조용히 깨진다 — 실제로 BackupCode·WebauthnKey에서 그렇게 깨져 있었다.
-- =============================================================
DO $cascade$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('Submission',       'Submission_userId_fkey',             'userId',       'User',       'id'),
      ('Bookmark',         'Bookmark_userId_fkey',               'userId',       'User',       'id'),
      ('Bookmark',         'Bookmark_problemId_fkey',            'problemId',    'Problem',    'id'),
      ('InterviewSession', 'InterviewSession_userId_fkey',       'userId',       'User',       'id'),
      ('InterviewSession', 'InterviewSession_submissionId_fkey', 'submissionId', 'Submission', 'id'),
      ('Post',             'Post_authorId_fkey',                 'authorId',     'User',       'id'),
      ('Comment',          'Comment_authorId_fkey',              'authorId',     'User',       'id'),
      ('PostLike',         'PostLike_userId_fkey',               'userId',       'User',       'id'),
      ('PollVote',         'PollVote_userId_fkey',               'userId',       'User',       'id'),
      ('LessonProgress',   'LessonProgress_userId_fkey',         'userId',       'User',       'id'),
      ('LessonProgress',   'LessonProgress_lessonId_fkey',       'lessonId',     'Lesson',     'id'),
      ('ProblemDraft',     'ProblemDraft_authorId_fkey',         'authorId',     'User',       'id'),
      ('RunAttempt',       'RunAttempt_problemId_fkey',          'problemId',    'Problem',    'id'),
      ('TestCase',         'TestCase_problemId_fkey',            'problemId',    'Problem',    'id')
    ) AS t(tbl, con, col, reftbl, refcol)
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.con);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE CASCADE',
      r.tbl, r.con, r.col, r.reftbl, r.refcol
    );
  END LOOP;
END
$cascade$;
