using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddItemQuestionImage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "QuestionImageAlt",
                table: "Items",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QuestionImageKey",
                table: "Items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Items_QuestionImage_Alt",
                table: "Items",
                sql: "(\"QuestionImageKey\" IS NULL) = (\"QuestionImageAlt\" IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Items_QuestionImage_Alt",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "QuestionImageAlt",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "QuestionImageKey",
                table: "Items");
        }
    }
}
