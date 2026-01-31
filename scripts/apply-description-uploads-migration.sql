-- Apply schema changes for Category/Keyword Description, Uploads table, and Item.UploadId
-- Run this against your PostgreSQL database if dotnet ef database update cannot connect.

-- 1. Add Description to Categories
ALTER TABLE "Categories"
ADD COLUMN IF NOT EXISTS "Description" character varying(500) NULL;

-- 2. Add Description to CategoryKeywords
ALTER TABLE "CategoryKeywords"
ADD COLUMN IF NOT EXISTS "Description" character varying(500) NULL;

-- 3. Create Uploads table (if not exists)
CREATE TABLE IF NOT EXISTS "Uploads" (
    "Id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "InputText" text NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "Hash" character varying(64) NOT NULL,
    CONSTRAINT "PK_Uploads" PRIMARY KEY ("Id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_Uploads_UserId_Hash" ON "Uploads" ("UserId", "Hash");
CREATE INDEX IF NOT EXISTS "IX_Uploads_CreatedAt" ON "Uploads" ("CreatedAt");

-- 4. Add UploadId to Items
ALTER TABLE "Items"
ADD COLUMN IF NOT EXISTS "UploadId" uuid NULL;

CREATE INDEX IF NOT EXISTS "IX_Items_UploadId" ON "Items" ("UploadId");

-- 5. Record migration in EF history (so future dotnet ef database update does not re-apply)
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260130150000_AddCategoryKeywordDescriptionsUploadsAndItemUploadId', '10.0.2')
ON CONFLICT ("MigrationId") DO NOTHING;
