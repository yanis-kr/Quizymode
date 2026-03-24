using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSeedSyncMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsSeedManaged",
                table: "Items",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "SeedHash",
                table: "Items",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SeedId",
                table: "Items",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SeedLastSyncedAt",
                table: "Items",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SeedSet",
                table: "Items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Items_IsSeedManaged_SeedSet",
                table: "Items",
                columns: new[] { "IsSeedManaged", "SeedSet" });

            migrationBuilder.CreateIndex(
                name: "IX_Items_SeedId",
                table: "Items",
                column: "SeedId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Items_IsSeedManaged_SeedSet",
                table: "Items");

            migrationBuilder.DropIndex(
                name: "IX_Items_SeedId",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "IsSeedManaged",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "SeedHash",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "SeedId",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "SeedLastSyncedAt",
                table: "Items");

            migrationBuilder.DropColumn(
                name: "SeedSet",
                table: "Items");
        }
    }
}
