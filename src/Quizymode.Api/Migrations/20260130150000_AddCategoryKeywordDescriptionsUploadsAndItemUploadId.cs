using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCategoryKeywordDescriptionsUploadsAndItemUploadId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Categories",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "CategoryKeywords",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Uploads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    InputText = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Uploads", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Uploads_UserId_Hash",
                table: "Uploads",
                columns: new[] { "UserId", "Hash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Uploads_CreatedAt",
                table: "Uploads",
                column: "CreatedAt");

            migrationBuilder.AddColumn<Guid>(
                name: "UploadId",
                table: "Items",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Items_UploadId",
                table: "Items",
                column: "UploadId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Items_UploadId",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "UploadId",
                table: "Items");

            migrationBuilder.DropTable(
                name: "Uploads");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "CategoryKeywords");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Categories");
        }
    }
}
