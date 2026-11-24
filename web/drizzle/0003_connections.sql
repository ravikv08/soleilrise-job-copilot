ALTER TABLE "applications" ADD COLUMN "network" jsonb;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "outreach" jsonb DEFAULT '{}'::jsonb NOT NULL;