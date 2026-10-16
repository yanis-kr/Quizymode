using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddClientErrors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ClientErrors",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Fingerprint = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Source = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ErrorName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Stack = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    ComponentStack = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Path = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    AppVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    SessionId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    VisitorId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsAuthenticated = table.Column<bool>(type: "boolean", nullable: false),
                    UserAgent = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    DeviceClass = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    IsBot = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    IsInternal = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    OccurredUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientErrors", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClientErrors_AppVersion",
                table: "ClientErrors",
                column: "AppVersion");

            migrationBuilder.CreateIndex(
                name: "IX_ClientErrors_Fingerprint_OccurredUtc",
                table: "ClientErrors",
                columns: new[] { "Fingerprint", "OccurredUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ClientErrors_OccurredUtc",
                table: "ClientErrors",
                column: "OccurredUtc");

            migrationBuilder.CreateIndex(
                name: "IX_ClientErrors_SessionId_Fingerprint",
                table: "ClientErrors",
                columns: new[] { "SessionId", "Fingerprint" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ClientErrors");
        }
    }
}
