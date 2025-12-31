using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddKeywordsAndItemKeywords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "keywords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    IsPrivate = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_keywords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "item_keywords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    KeywordId = table.Column<Guid>(type: "uuid", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_item_keywords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_item_keywords_items_ItemId",
                        column: x => x.ItemId,
                        principalTable: "items",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_item_keywords_keywords_KeywordId",
                        column: x => x.KeywordId,
                        principalTable: "keywords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_item_keywords_ItemId",
                table: "item_keywords",
                column: "ItemId");

            migrationBuilder.CreateIndex(
                name: "IX_item_keywords_ItemId_KeywordId",
                table: "item_keywords",
                columns: new[] { "ItemId", "KeywordId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_item_keywords_KeywordId",
                table: "item_keywords",
                column: "KeywordId");

            migrationBuilder.CreateIndex(
                name: "IX_keywords_CreatedBy",
                table: "keywords",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_keywords_IsPrivate",
                table: "keywords",
                column: "IsPrivate");

            migrationBuilder.CreateIndex(
                name: "IX_keywords_Name_CreatedBy_IsPrivate",
                table: "keywords",
                columns: new[] { "Name", "CreatedBy", "IsPrivate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "item_keywords");

            migrationBuilder.DropTable(
                name: "keywords");
        }
    }
}
