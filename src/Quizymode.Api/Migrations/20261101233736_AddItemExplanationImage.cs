using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddItemExplanationImage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExplanationImageAlt",
                table: "Items",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExplanationImageKey",
                table: "Items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Skipped",
                table: "DailyQuizCompletions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Items_ExplanationImage_Alt",
                table: "Items",
                sql: "(\"ExplanationImageKey\" IS NULL) = (\"ExplanationImageAlt\" IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_DailyQuizCompletions_Skipped",
                table: "DailyQuizCompletions",
                sql: "\"Skipped\" >= 0 AND \"Correct\" + \"Skipped\" <= \"Total\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Items_ExplanationImage_Alt",
                table: "Items");

            migrationBuilder.DropCheckConstraint(
                name: "CK_DailyQuizCompletions_Skipped",
                table: "DailyQuizCompletions");

            migrationBuilder.DropColumn(
                name: "ExplanationImageAlt",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "ExplanationImageKey",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "Skipped",
                table: "DailyQuizCompletions");
        }
    }
}
