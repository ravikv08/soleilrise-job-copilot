CREATE TABLE "job_scores" (
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"match" integer NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	"missing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scored_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_scores_user_id_job_id_pk" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "job_scores" ADD CONSTRAINT "job_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scores" ADD CONSTRAINT "job_scores_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_scores_user_match_idx" ON "job_scores" USING btree ("user_id","match");