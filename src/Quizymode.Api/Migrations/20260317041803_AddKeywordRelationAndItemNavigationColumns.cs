using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddKeywordRelationAndItemNavigationColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsReviewPending",
                table: "Keywords",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReviewedAt",
                table: "Keywords",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewedBy",
                table: "Keywords",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "NavigationKeywordId1",
                table: "Items",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "NavigationKeywordId2",
                table: "Items",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CategoryKeywordSuggestions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
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

            migrationBuilder.CreateTable(
                name: "KeywordRelations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentKeywordId = table.Column<Guid>(type: "uuid", nullable: true),
                    ChildKeywordId = table.Column<Guid>(type: "uuid", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsReviewPending = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KeywordRelations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KeywordRelations_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_KeywordRelations_Keywords_ChildKeywordId",
                        column: x => x.ChildKeywordId,
                        principalTable: "Keywords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_KeywordRelations_Keywords_ParentKeywordId",
                        column: x => x.ParentKeywordId,
                        principalTable: "Keywords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Items_NavigationKeywordId1",
                table: "Items",
                column: "NavigationKeywordId1");

            migrationBuilder.CreateIndex(
                name: "IX_Items_NavigationKeywordId2",
                table: "Items",
                column: "NavigationKeywordId2");

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywordSuggestions_CategoryId_KeywordId_RequestedRa~",
                table: "CategoryKeywordSuggestions",
                columns: new[] { "CategoryId", "KeywordId", "RequestedRank", "RequestedParentName", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywordSuggestions_KeywordId",
                table: "CategoryKeywordSuggestions",
                column: "KeywordId");

            migrationBuilder.CreateIndex(
                name: "IX_KeywordRelations_CategoryId_ParentKeywordId_ChildKeywordId",
                table: "KeywordRelations",
                columns: new[] { "CategoryId", "ParentKeywordId", "ChildKeywordId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_KeywordRelations_ChildKeywordId",
                table: "KeywordRelations",
                column: "ChildKeywordId");

            migrationBuilder.CreateIndex(
                name: "IX_KeywordRelations_ParentKeywordId",
                table: "KeywordRelations",
                column: "ParentKeywordId");

            migrationBuilder.AddForeignKey(
                name: "FK_Items_Keywords_NavigationKeywordId1",
                table: "Items",
                column: "NavigationKeywordId1",
                principalTable: "Keywords",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Items_Keywords_NavigationKeywordId2",
                table: "Items",
                column: "NavigationKeywordId2",
                principalTable: "Keywords",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Items_Keywords_NavigationKeywordId1",
                table: "Items");

            migrationBuilder.DropForeignKey(
                name: "FK_Items_Keywords_NavigationKeywordId2",
                table: "Items");

            migrationBuilder.DropTable(
                name: "CategoryKeywordSuggestions");

            migrationBuilder.DropTable(
                name: "KeywordRelations");

            migrationBuilder.DropIndex(
                name: "IX_Items_NavigationKeywordId1",
                table: "Items");

            migrationBuilder.DropIndex(
                name: "IX_Items_NavigationKeywordId2",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "IsReviewPending",
                table: "Keywords");

            migrationBuilder.DropColumn(
                name: "ReviewedAt",
                table: "Keywords");

            migrationBuilder.DropColumn(
                name: "ReviewedBy",
                table: "Keywords");

            migrationBuilder.DropColumn(
                name: "NavigationKeywordId1",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "NavigationKeywordId2",
                table: "Items");
        }
    }
}
