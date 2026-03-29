using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPageViews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PageViews",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsAuthenticated = table.Column<bool>(type: "boolean", nullable: false),
                    SessionId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    IpAddress = table.Column<string>(type: "character varying(45)", maxLength: 45, nullable: false),
                    Path = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    QueryString = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    Url = table.Column<string>(type: "character varying(4096)", maxLength: 4096, nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PageViews", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PageViews_CreatedUtc",
                table: "PageViews",
                column: "CreatedUtc");

            migrationBuilder.CreateIndex(
                name: "IX_PageViews_IsAuthenticated",
                table: "PageViews",
                column: "IsAuthenticated");

            migrationBuilder.CreateIndex(
                name: "IX_PageViews_Path",
                table: "PageViews",
                column: "Path");

            migrationBuilder.CreateIndex(
                name: "IX_PageViews_Path_CreatedUtc",
                table: "PageViews",
                columns: new[] { "Path", "CreatedUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_PageViews_SessionId",
                table: "PageViews",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_PageViews_UserId",
                table: "PageViews",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PageViews");
        }
    }
}
