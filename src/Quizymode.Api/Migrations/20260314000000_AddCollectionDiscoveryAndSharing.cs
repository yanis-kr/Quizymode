using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCollectionDiscoveryAndSharing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPublic",
                table: "Collections",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "CollectionBookmarks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    CollectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionBookmarks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CollectionShares",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CollectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SharedBy = table.Column<string>(type: "text", nullable: false),
                    SharedWithUserId = table.Column<string>(type: "text", nullable: true),
                    SharedWithEmail = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionShares", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CollectionBookmarks_UserId_CollectionId",
                table: "CollectionBookmarks",
                columns: new[] { "UserId", "CollectionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CollectionBookmarks_UserId",
                table: "CollectionBookmarks",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionBookmarks_CollectionId",
                table: "CollectionBookmarks",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionShares_CollectionId",
                table: "CollectionShares",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionShares_SharedWithUserId",
                table: "CollectionShares",
                column: "SharedWithUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionShares_SharedWithEmail",
                table: "CollectionShares",
                column: "SharedWithEmail");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CollectionBookmarks");

            migrationBuilder.DropTable(
                name: "CollectionShares");

            migrationBuilder.DropColumn(
                name: "IsPublic",
                table: "Collections");
        }
    }
}
