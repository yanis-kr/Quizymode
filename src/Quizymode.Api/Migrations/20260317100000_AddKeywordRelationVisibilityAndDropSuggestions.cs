using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Quizymode.Api.Data;

#nullable disable

namespace Quizymode.Api.Migrations;

/// <inheritdoc />
[DbContext(typeof(ApplicationDbContext))]
[Migration("20260317100000_AddKeywordRelationVisibilityAndDropSuggestions")]
public partial class AddKeywordRelationVisibilityAndDropSuggestions : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "IsPrivate",
            table: "KeywordRelations",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<string>(
            name: "CreatedBy",
            table: "KeywordRelations",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);

        migrationBuilder.DropTable(
            name: "CategoryKeywordSuggestions");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CategoryKeywordSuggestions",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                KeywordId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                RequestedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                RequestedParentKeywordId = table.Column<Guid>(type: "uuid", nullable: true),
                RequestedRank = table.Column<int>(type: "integer", nullable: false),
                ReviewNotes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                ReviewedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
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
            name: "IX_CategoryKeywordSuggestions_KeywordId",
            table: "CategoryKeywordSuggestions",
            column: "KeywordId");

        migrationBuilder.CreateIndex(
            name: "IX_CategoryKeywordSuggestions_CategoryId_KeywordId_RequestedRank_RequestedParentKeywordId_Status",
            table: "CategoryKeywordSuggestions",
            columns: new[] { "CategoryId", "KeywordId", "RequestedRank", "RequestedParentKeywordId", "Status" });

        migrationBuilder.DropColumn(
            name: "CreatedBy",
            table: "KeywordRelations");

        migrationBuilder.DropColumn(
            name: "IsPrivate",
            table: "KeywordRelations");
    }
}
