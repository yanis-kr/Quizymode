using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGlobalSearchIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Global search (#319). The generated tsvector columns are deliberately NOT mapped in the EF
            // model: they are only read by raw SQL in GlobalSearch, and mapping them would make every Item
            // load select the vector and break EnsureCreated in the SQLite test fixture.
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS pg_trgm;");

            migrationBuilder.Sql("""
                ALTER TABLE "Items" ADD COLUMN "SearchVector" tsvector GENERATED ALWAYS AS (
                    setweight(to_tsvector('english'::regconfig, coalesce("Question", '')), 'A') ||
                    setweight(to_tsvector('english'::regconfig, coalesce("CorrectAnswer", '')), 'B') ||
                    setweight(to_tsvector('english'::regconfig, coalesce("Explanation", '')), 'C')) STORED;
                """);
            migrationBuilder.Sql("""CREATE INDEX "IX_Items_SearchVector" ON "Items" USING GIN ("SearchVector");""");

            migrationBuilder.Sql("""
                ALTER TABLE "Collections" ADD COLUMN "SearchVector" tsvector GENERATED ALWAYS AS (
                    setweight(to_tsvector('english'::regconfig, coalesce("Name", '')), 'A') ||
                    setweight(to_tsvector('english'::regconfig, coalesce("Description", '')), 'B')) STORED;
                """);
            migrationBuilder.Sql("""CREATE INDEX "IX_Collections_SearchVector" ON "Collections" USING GIN ("SearchVector");""");
            migrationBuilder.Sql("""CREATE INDEX "IX_Collections_Name_Trgm" ON "Collections" USING GIN (lower("Name") gin_trgm_ops);""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_Collections_Name_Trgm";""");
            migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_Collections_SearchVector";""");
            migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_Items_SearchVector";""");
            migrationBuilder.Sql("""ALTER TABLE "Collections" DROP COLUMN IF EXISTS "SearchVector";""");
            migrationBuilder.Sql("""ALTER TABLE "Items" DROP COLUMN IF EXISTS "SearchVector";""");

            // pg_trgm is intentionally left installed: dropping an extension can break other objects that
            // came to depend on it, and it is harmless when unused.
        }
    }
}
