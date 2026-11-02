DROP INDEX "PasswordResetToken_tokenHash_key";

ALTER TABLE "PasswordResetToken"
RENAME COLUMN "tokenHash" TO "codeHash";

ALTER TABLE "PasswordResetToken"
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
