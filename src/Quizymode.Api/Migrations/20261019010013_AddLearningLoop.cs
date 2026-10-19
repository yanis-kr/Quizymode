using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddLearningLoop : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DailyQuizCompletions",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Correct = table.Column<int>(type: "integer", nullable: false),
                    Total = table.Column<int>(type: "integer", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyQuizCompletions", x => new { x.UserId, x.Date });
                    table.CheckConstraint("CK_DailyQuizCompletions_Counts", "\"Total\" > 0 AND \"Correct\" >= 0 AND \"Correct\" <= \"Total\"");
                });

            migrationBuilder.CreateTable(
                name: "DailyQuizItems",
                columns: table => new
                {
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExcludedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExcludedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyQuizItems", x => new { x.Date, x.ItemId });
                });

            migrationBuilder.CreateTable(
                name: "DailyQuizSets",
                columns: table => new
                {
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyQuizSets", x => x.Date);
                });

            migrationBuilder.CreateTable(
                name: "ReviewQueueEntries",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    IntervalIndex = table.Column<int>(type: "integer", nullable: false),
                    DueAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ItemVersionAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReviewQueueEntries", x => new { x.UserId, x.ItemId });
                    table.CheckConstraint("CK_ReviewQueueEntries_IntervalIndex", "\"IntervalIndex\" >= 0 AND \"IntervalIndex\" < 5");
                });

            migrationBuilder.CreateTable(
                name: "UserInterests",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserInterests", x => new { x.UserId, x.CategoryId });
                });

            migrationBuilder.CreateIndex(
                name: "IX_DailyQuizItems_ItemId",
                table: "DailyQuizItems",
                column: "ItemId");

            migrationBuilder.CreateIndex(
                name: "IX_ReviewQueueEntries_UserId_DueAt",
                table: "ReviewQueueEntries",
                columns: new[] { "UserId", "DueAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DailyQuizCompletions");

            migrationBuilder.DropTable(
                name: "DailyQuizItems");

            migrationBuilder.DropTable(
                name: "DailyQuizSets");

            migrationBuilder.DropTable(
                name: "ReviewQueueEntries");

            migrationBuilder.DropTable(
                name: "UserInterests");
        }
    }
}
