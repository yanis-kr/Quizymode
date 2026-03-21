using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class MigrateCategoryKeywordToKeywordRelation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Copy rank-1 CategoryKeywords to KeywordRelations (ParentKeywordId = null)
            migrationBuilder.Sql(@"
                INSERT INTO ""KeywordRelations"" (""Id"", ""CategoryId"", ""ParentKeywordId"", ""ChildKeywordId"", ""SortOrder"", ""Description"", ""CreatedAt"")
                SELECT gen_random_uuid(), ""CategoryId"", NULL, ""KeywordId"", COALESCE(""SortRank"", 0), ""Description"", ""CreatedAt""
                FROM ""CategoryKeywords"" WHERE ""NavigationRank"" = 1;");

            // Copy rank-2 CategoryKeywords to KeywordRelations (ParentKeywordId = parent keyword by name)
            migrationBuilder.Sql(@"
                INSERT INTO ""KeywordRelations"" (""Id"", ""CategoryId"", ""ParentKeywordId"", ""ChildKeywordId"", ""SortOrder"", ""Description"", ""CreatedAt"")
                SELECT gen_random_uuid(), ck.""CategoryId"", parent_ck.""KeywordId"", ck.""KeywordId"", COALESCE(ck.""SortRank"", 0), ck.""Description"", ck.""CreatedAt""
                FROM ""CategoryKeywords"" ck
                INNER JOIN ""Keywords"" parent_k ON LOWER(parent_k.""Name"") = LOWER(ck.""ParentName"")
                INNER JOIN ""CategoryKeywords"" parent_ck ON parent_ck.""CategoryId"" = ck.""CategoryId"" AND parent_ck.""KeywordId"" = parent_k.""Id"" AND parent_ck.""NavigationRank"" = 1
                WHERE ck.""NavigationRank"" = 2
                ON CONFLICT (""CategoryId"", ""ParentKeywordId"", ""ChildKeywordId"") DO NOTHING;");

            // Backfill Item.NavigationKeywordId1 from ItemKeywords that are rank-1 in item's category
            migrationBuilder.Sql(@"
                UPDATE ""Items"" i
                SET ""NavigationKeywordId1"" = (
                    SELECT ck.""KeywordId"" FROM ""ItemKeywords"" ik
                    INNER JOIN ""CategoryKeywords"" ck ON ck.""KeywordId"" = ik.""KeywordId"" AND ck.""CategoryId"" = i.""CategoryId"" AND ck.""NavigationRank"" = 1
                    WHERE ik.""ItemId"" = i.""Id""
                    LIMIT 1
                )
                WHERE i.""CategoryId"" IS NOT NULL;");

            // Backfill Item.NavigationKeywordId2 from ItemKeywords that are rank-2 in item's category
            migrationBuilder.Sql(@"
                UPDATE ""Items"" i
                SET ""NavigationKeywordId2"" = (
                    SELECT ck.""KeywordId"" FROM ""ItemKeywords"" ik
                    INNER JOIN ""CategoryKeywords"" ck ON ck.""KeywordId"" = ik.""KeywordId"" AND ck.""CategoryId"" = i.""CategoryId"" AND ck.""NavigationRank"" = 2
                    WHERE ik.""ItemId"" = i.""Id""
                    LIMIT 1
                )
                WHERE i.""CategoryId"" IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data migration down: clear backfilled columns; do not re-create CategoryKeywords data
            migrationBuilder.Sql(@"UPDATE ""Items"" SET ""NavigationKeywordId1"" = NULL, ""NavigationKeywordId2"" = NULL WHERE ""NavigationKeywordId1"" IS NOT NULL OR ""NavigationKeywordId2"" IS NOT NULL;");
            migrationBuilder.Sql(@"DELETE FROM ""KeywordRelations"";");
        }
    }
}
