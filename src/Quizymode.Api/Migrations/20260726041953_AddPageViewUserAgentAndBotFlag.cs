using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPageViewUserAgentAndBotFlag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsBot",
                table: "PageViews",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "UserAgent",
                table: "PageViews",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PageViews_IsBot",
                table: "PageViews",
                column: "IsBot");

            migrationBuilder.CreateIndex(
                name: "IX_PageViews_SessionId_CreatedUtc",
                table: "PageViews",
                columns: new[] { "SessionId", "CreatedUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PageViews_IsBot",
                table: "PageViews");

            migrationBuilder.DropIndex(
                name: "IX_PageViews_SessionId_CreatedUtc",
                table: "PageViews");

            migrationBuilder.DropColumn(
                name: "IsBot",
                table: "PageViews");

            migrationBuilder.DropColumn(
                name: "UserAgent",
                table: "PageViews");
        }
    }
}
