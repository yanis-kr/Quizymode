using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCollectionRatings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CollectionRatings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CollectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Stars = table.Column<int>(type: "integer", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionRatings", x => x.Id);
                    table.CheckConstraint("CK_CollectionRatings_Stars_Range", "\"Stars\" >= 1 AND \"Stars\" <= 5");
                });

            migrationBuilder.CreateIndex(
                name: "IX_CollectionRatings_CollectionId",
                table: "CollectionRatings",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionRatings_CollectionId_CreatedBy",
                table: "CollectionRatings",
                columns: new[] { "CollectionId", "CreatedBy" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CollectionRatings");
        }
    }
}
