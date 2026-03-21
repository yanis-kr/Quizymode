using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class DropCategoryKeywordsAndRenameSuggestionParent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CategoryKeywords");

            migrationBuilder.DropIndex(
                name: "IX_CategoryKeywordSuggestions_CategoryId_KeywordId_RequestedRa~",
                table: "CategoryKeywordSuggestions");

            migrationBuilder.DropColumn(
                name: "RequestedParentName",
                table: "CategoryKeywordSuggestions");

            migrationBuilder.AddColumn<Guid>(
                name: "RequestedParentKeywordId",
                table: "CategoryKeywordSuggestions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywordSuggestions_CategoryId_KeywordId_RequestedRa~",
                table: "CategoryKeywordSuggestions",
                columns: new[] { "CategoryId", "KeywordId", "RequestedRank", "RequestedParentKeywordId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CategoryKeywordSuggestions_CategoryId_KeywordId_RequestedRa~",
                table: "CategoryKeywordSuggestions");

            migrationBuilder.DropColumn(
                name: "RequestedParentKeywordId",
                table: "CategoryKeywordSuggestions");

            migrationBuilder.AddColumn<string>(
                name: "RequestedParentName",
                table: "CategoryKeywordSuggestions",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CategoryKeywords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    KeywordId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    NavigationRank = table.Column<int>(type: "integer", nullable: true),
                    ParentName = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    SortRank = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CategoryKeywords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CategoryKeywords_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CategoryKeywords_Keywords_KeywordId",
                        column: x => x.KeywordId,
                        principalTable: "Keywords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywordSuggestions_CategoryId_KeywordId_RequestedRa~",
                table: "CategoryKeywordSuggestions",
                columns: new[] { "CategoryId", "KeywordId", "RequestedRank", "RequestedParentName", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywords_CategoryId_KeywordId",
                table: "CategoryKeywords",
                columns: new[] { "CategoryId", "KeywordId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywords_CategoryId_NavigationRank",
                table: "CategoryKeywords",
                columns: new[] { "CategoryId", "NavigationRank" });

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywords_CategoryId_ParentName",
                table: "CategoryKeywords",
                columns: new[] { "CategoryId", "ParentName" });

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywords_KeywordId",
                table: "CategoryKeywords",
                column: "KeywordId");
        }
    }
}
