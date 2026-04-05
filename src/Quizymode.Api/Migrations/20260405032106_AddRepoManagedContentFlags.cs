using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRepoManagedContentFlags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsRepoManaged",
                table: "Items",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Collections",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<bool>(
                name: "IsPublic",
                table: "Collections",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean");

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Collections",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "CreatedBy",
                table: "Collections",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<Guid>(
                name: "Id",
                table: "Collections",
                type: "uuid",
                nullable: false,
                defaultValueSql: "gen_random_uuid()",
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<bool>(
                name: "IsRepoManaged",
                table: "Collections",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.Sql("""
                UPDATE "Items"
                SET "IsRepoManaged" = TRUE
                WHERE "IsPrivate" = FALSE
                  AND lower("CreatedBy") = 'seeder';
                """);

            migrationBuilder.Sql("""
                UPDATE "Collections"
                SET "IsRepoManaged" = TRUE
                WHERE "IsPublic" = TRUE
                  AND lower("CreatedBy") = 'seeder';
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Items_IsRepoManaged",
                table: "Items",
                column: "IsRepoManaged");

            migrationBuilder.CreateIndex(
                name: "IX_Collections_CreatedBy",
                table: "Collections",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Collections_IsPublic",
                table: "Collections",
                column: "IsPublic");

            migrationBuilder.CreateIndex(
                name: "IX_Collections_IsRepoManaged",
                table: "Collections",
                column: "IsRepoManaged");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Items_IsRepoManaged",
                table: "Items");

            migrationBuilder.DropIndex(
                name: "IX_Collections_CreatedBy",
                table: "Collections");

            migrationBuilder.DropIndex(
                name: "IX_Collections_IsPublic",
                table: "Collections");

            migrationBuilder.DropIndex(
                name: "IX_Collections_IsRepoManaged",
                table: "Collections");

            migrationBuilder.DropColumn(
                name: "IsRepoManaged",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "IsRepoManaged",
                table: "Collections");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Collections",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<bool>(
                name: "IsPublic",
                table: "Collections",
                type: "boolean",
                nullable: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldDefaultValue: false);

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Collections",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(2000)",
                oldMaxLength: 2000,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "CreatedBy",
                table: "Collections",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(100)",
                oldMaxLength: 100);

            migrationBuilder.AlterColumn<Guid>(
                name: "Id",
                table: "Collections",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldDefaultValueSql: "gen_random_uuid()");
        }
    }
}
