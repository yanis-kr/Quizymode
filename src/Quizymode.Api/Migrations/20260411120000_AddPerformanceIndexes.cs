using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // CollectionItems — foreign key columns used in joins and filters had no indexes
            migrationBuilder.CreateIndex(
                name: "IX_CollectionItems_CollectionId",
                table: "CollectionItems",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionItems_ItemId",
                table: "CollectionItems",
                column: "ItemId");

            // Case-insensitive lookup indexes: LOWER(Name) expression indexes allow
            // queries using k.Name.ToLower() == x to hit the index instead of doing a seq scan.
            migrationBuilder.Sql(
                """CREATE INDEX "IX_Keywords_Name_Lower" ON "Keywords" (LOWER("Name"));""");

            migrationBuilder.Sql(
                """CREATE INDEX "IX_Categories_Name_Lower" ON "Categories" (LOWER("Name"));""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CollectionItems_CollectionId",
                table: "CollectionItems");

            migrationBuilder.DropIndex(
                name: "IX_CollectionItems_ItemId",
                table: "CollectionItems");

            migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_Keywords_Name_Lower";""");
            migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_Categories_Name_Lower";""");
        }
    }
}
