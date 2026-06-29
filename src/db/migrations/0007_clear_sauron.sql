CREATE TABLE "refreshTokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"revokedAt" timestamp with time zone,
	CONSTRAINT "refreshTokens_tokenHash_key" UNIQUE("tokenHash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "isPlaceholder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "refreshTokens" ADD CONSTRAINT "refreshTokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;