using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDurablePictureUploadAttempts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "EstimatedCostUsd",
                table: "MediaAdvisoryJobs",
                type: "numeric(12,6)",
                precision: 12,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "InputTokens",
                table: "MediaAdvisoryJobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OutputTokens",
                table: "MediaAdvisoryJobs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ReservedCostUsd",
                table: "MediaAdvisoryJobs",
                type: "numeric(12,6)",
                precision: 12,
                scale: 6,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "MediaUploadAttempts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUserId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaUploadAttempts", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MediaUploadAttempts_OwnerUserId_CreatedAt",
                table: "MediaUploadAttempts",
                columns: new[] { "OwnerUserId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MediaUploadAttempts");

            migrationBuilder.DropColumn(
                name: "EstimatedCostUsd",
                table: "MediaAdvisoryJobs");

            migrationBuilder.DropColumn(
                name: "InputTokens",
                table: "MediaAdvisoryJobs");

            migrationBuilder.DropColumn(
                name: "OutputTokens",
                table: "MediaAdvisoryJobs");

            migrationBuilder.DropColumn(
                name: "ReservedCostUsd",
                table: "MediaAdvisoryJobs");
        }
    }
}
