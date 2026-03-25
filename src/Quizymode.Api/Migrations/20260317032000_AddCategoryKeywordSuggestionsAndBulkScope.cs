using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    public partial class AddCategoryKeywordSuggestionsAndBulkScope : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CategoryKeywordSuggestions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    KeywordId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedRank = table.Column<int>(type: "integer", nullable: false),
                    RequestedParentName = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    RequestedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ReviewNotes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CategoryKeywordSuggestions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CategoryKeywordSuggestions_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CategoryKeywordSuggestions_Keywords_KeywordId",
                        column: x => x.KeywordId,
                        principalTable: "Keywords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywordSuggestions_CategoryId_KeywordId_RequestedRa~",
                table: "CategoryKeywordSuggestions",
                columns: new[] { "CategoryId", "KeywordId", "RequestedRank", "RequestedParentName", "Status" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CategoryKeywordSuggestions");
        }
    }
}

