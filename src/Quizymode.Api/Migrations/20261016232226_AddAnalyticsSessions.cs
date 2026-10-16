using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAnalyticsSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AnalyticsSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    SessionId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    VisitorId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    FirstSeenUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LandingPath = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    LandingQuery = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false, defaultValue: ""),
                    ReferrerHost = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    UtmSource = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    UtmMedium = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    UtmCampaign = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    UtmContent = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    UtmTerm = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ClickIdPlatform = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Channel = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DeviceClass = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Country = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true),
                    AppVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalyticsSessions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsSessions_Channel",
                table: "AnalyticsSessions",
                column: "Channel");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsSessions_FirstSeenUtc",
                table: "AnalyticsSessions",
                column: "FirstSeenUtc");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsSessions_SessionId",
                table: "AnalyticsSessions",
                column: "SessionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsSessions_UserId",
                table: "AnalyticsSessions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsSessions_VisitorId",
                table: "AnalyticsSessions",
                column: "VisitorId");

            migrationBuilder.CreateIndex(
                name: "IX_AnalyticsSessions_VisitorId_FirstSeenUtc",
                table: "AnalyticsSessions",
                columns: new[] { "VisitorId", "FirstSeenUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AnalyticsSessions");
        }
    }
}
