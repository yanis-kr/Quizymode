using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAnalyticsEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AnalyticsEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    EventName = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SessionId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsAuthenticated = table.Column<bool>(type: "boolean", nullable: false),
                    Path = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    ContextType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ContextId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    RunId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    Position = table.Column<int>(type: "integer", nullable: true),
                    IsCorrect = table.Column<bool>(type: "boolean", nullable: true),
                    Score = table.Column<int>(type: "integer", nullable: true),
                    Total = table.Column<int>(type: "integer", nullable: true),
                    DedupeKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    UserAgent = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    IsBot = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    IsInternal = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    OccurredUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyticsEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_EventName_OccurredUtc",
                table: "AnalyticsEvents",
                columns: new[] { "EventName", "OccurredUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_IsInternal",
                table: "AnalyticsEvents",
                column: "IsInternal");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_OccurredUtc",
                table: "AnalyticsEvents",
                column: "OccurredUtc");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_RunId",
                table: "AnalyticsEvents",
                column: "RunId");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_SessionId",
                table: "AnalyticsEvents",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_SessionId_DedupeKey",
                table: "AnalyticsEvents",
                columns: new[] { "SessionId", "DedupeKey" },
                unique: true,
                filter: "\"DedupeKey\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsEvents_UserId",
                table: "AnalyticsEvents",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AnalyticsEvents");
        }
    }
}
