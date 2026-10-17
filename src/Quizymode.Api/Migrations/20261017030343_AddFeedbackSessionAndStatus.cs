using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFeedbackSessionAndStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SessionId",
                table: "FeedbackSubmissions",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "FeedbackSubmissions",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "New");

            migrationBuilder.CreateIndex(
                name: "IX_FeedbackSubmissions_Status",
                table: "FeedbackSubmissions",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FeedbackSubmissions_Status",
                table: "FeedbackSubmissions");

            migrationBuilder.DropColumn(
                name: "SessionId",
                table: "FeedbackSubmissions");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "FeedbackSubmissions");
        }
    }
}
