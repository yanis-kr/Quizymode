using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPageViewClassification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Area",
                table: "PageViews",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsItemStep",
                table: "PageViews",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "NavPath",
                table: "PageViews",
                type: "character varying(400)",
                maxLength: 400,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScopeKey",
                table: "PageViews",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScopeType",
                table: "PageViews",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PageViews_Area_CreatedUtc",
                table: "PageViews",
                columns: new[] { "Area", "CreatedUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PageViews_Area_CreatedUtc",
                table: "PageViews");

            migrationBuilder.DropColumn(
                name: "Area",
                table: "PageViews");

            migrationBuilder.DropColumn(
                name: "IsItemStep",
                table: "PageViews");

            migrationBuilder.DropColumn(
                name: "NavPath",
                table: "PageViews");

            migrationBuilder.DropColumn(
                name: "ScopeKey",
                table: "PageViews");

            migrationBuilder.DropColumn(
                name: "ScopeType",
                table: "PageViews");
        }
    }
}
