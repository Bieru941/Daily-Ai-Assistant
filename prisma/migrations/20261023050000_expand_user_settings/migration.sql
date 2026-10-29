ALTER TABLE "UserPreferences"
ADD COLUMN "responseStyle" TEXT NOT NULL DEFAULT 'balanced',
ADD COLUMN "customInstructions" TEXT NOT NULL DEFAULT '',
ADD COLUMN "startupPage" TEXT NOT NULL DEFAULT 'Dashboard',
ADD COLUMN "notificationPreferences" JSONB;
