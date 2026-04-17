using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddItemSpeechMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CorrectAnswerSpeech",
                table: "Items",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IncorrectAnswerSpeech",
                table: "Items",
                type: "jsonb",
                nullable: false,
                defaultValueSql: "'{}'::jsonb");

            migrationBuilder.AddColumn<string>(
                name: "QuestionSpeech",
                table: "Items",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CorrectAnswerSpeech",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "IncorrectAnswerSpeech",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "QuestionSpeech",
                table: "Items");
        }
    }
}
