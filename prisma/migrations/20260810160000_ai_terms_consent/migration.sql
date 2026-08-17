-- debateAI 이용약관 동의 / 학습 활용 동의(선택)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiTermsAgreedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiTrainingConsentAt" TIMESTAMP(3);
