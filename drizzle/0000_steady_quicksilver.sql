CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notes_tenant_isolation" ON "notes" AS PERMISSIVE FOR ALL TO public USING ("notes"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("notes"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);