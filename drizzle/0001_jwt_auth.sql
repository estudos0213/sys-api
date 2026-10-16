CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "notes_tenant_created_at_idx" ON "notes" USING btree ("tenant_id","created_at");
--> statement-breakpoint
ALTER TABLE "notes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Only the administrative provisioning command may change credentials.
REVOKE INSERT, UPDATE, DELETE ON TABLE "users" FROM app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "users" TO app_user;
