using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateItemVisibilityToIsPrivate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPrivate",
                table: "items",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.Sql(
                """
                UPDATE "items"
                SET "IsPrivate" = CASE WHEN "Visibility" = 'private' THEN TRUE ELSE FALSE END
                """);

            migrationBuilder.DropColumn(
                name: "Visibility",
                table: "items");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Visibility",
                table: "items",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "global");

            migrationBuilder.Sql(
                """
                UPDATE "items"
                SET "Visibility" = CASE WHEN "IsPrivate" = TRUE THEN 'private' ELSE 'global' END
                """);

            migrationBuilder.DropColumn(
                name: "IsPrivate",
                table: "items");
        }
    }
}
