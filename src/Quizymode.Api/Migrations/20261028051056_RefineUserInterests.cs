using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class RefineUserInterests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_UserInterests",
                table: "UserInterests");

            migrationBuilder.AddColumn<Guid>(
                name: "Id",
                table: "UserInterests",
                type: "uuid",
                nullable: false,
                defaultValueSql: "gen_random_uuid()");

            migrationBuilder.AddColumn<Guid>(
                name: "NavigationKeywordId1",
                table: "UserInterests",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "NavigationKeywordId2",
                table: "UserInterests",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_UserInterests",
                table: "UserInterests",
                column: "Id");

            migrationBuilder.CreateIndex(
                name: "IX_UserInterests_NavigationKeywordId1",
                table: "UserInterests",
                column: "NavigationKeywordId1");

            migrationBuilder.CreateIndex(
                name: "IX_UserInterests_NavigationKeywordId2",
                table: "UserInterests",
                column: "NavigationKeywordId2");

            migrationBuilder.CreateIndex(
                name: "IX_UserInterests_UserId_CategoryId_NavigationKeywordId1_Naviga~",
                table: "UserInterests",
                columns: new[] { "UserId", "CategoryId", "NavigationKeywordId1", "NavigationKeywordId2" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);

            migrationBuilder.AddForeignKey(
                name: "FK_UserInterests_Keywords_NavigationKeywordId1",
                table: "UserInterests",
                column: "NavigationKeywordId1",
                principalTable: "Keywords",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_UserInterests_Keywords_NavigationKeywordId2",
                table: "UserInterests",
                column: "NavigationKeywordId2",
                principalTable: "Keywords",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM "UserInterests" WHERE "NavigationKeywordId1" IS NOT NULL OR "NavigationKeywordId2" IS NOT NULL) THEN
                        RAISE EXCEPTION 'Cannot roll back while refined interests exist. Remove those selections explicitly first.';
                    END IF;
                END $$;
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_UserInterests_Keywords_NavigationKeywordId1",
                table: "UserInterests");

            migrationBuilder.DropForeignKey(
                name: "FK_UserInterests_Keywords_NavigationKeywordId2",
                table: "UserInterests");

            migrationBuilder.DropPrimaryKey(
                name: "PK_UserInterests",
                table: "UserInterests");

            migrationBuilder.DropIndex(
                name: "IX_UserInterests_NavigationKeywordId1",
                table: "UserInterests");

            migrationBuilder.DropIndex(
                name: "IX_UserInterests_NavigationKeywordId2",
                table: "UserInterests");

            migrationBuilder.DropIndex(
                name: "IX_UserInterests_UserId_CategoryId_NavigationKeywordId1_Naviga~",
                table: "UserInterests");

            migrationBuilder.DropColumn(
                name: "Id",
                table: "UserInterests");

            migrationBuilder.DropColumn(
                name: "NavigationKeywordId1",
                table: "UserInterests");

            migrationBuilder.DropColumn(
                name: "NavigationKeywordId2",
                table: "UserInterests");

            migrationBuilder.AddPrimaryKey(
                name: "PK_UserInterests",
                table: "UserInterests",
                columns: new[] { "UserId", "CategoryId" });
        }
    }
}
