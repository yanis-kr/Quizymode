using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCategoryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Ratings_ItemId_Stars",
                table: "Ratings",
                columns: new[] { "ItemId", "Stars" });

            migrationBuilder.CreateIndex(
                name: "IX_items_CategoryId_IsPrivate",
                table: "items",
                columns: new[] { "CategoryId", "IsPrivate" });

            migrationBuilder.CreateIndex(
                name: "IX_items_IsPrivate_CreatedBy",
                table: "items",
                columns: new[] { "IsPrivate", "CreatedBy" });

            migrationBuilder.CreateIndex(
                name: "IX_Categories_IsPrivate",
                table: "Categories",
                column: "IsPrivate");

            migrationBuilder.CreateIndex(
                name: "IX_Categories_IsPrivate_CreatedBy",
                table: "Categories",
                columns: new[] { "IsPrivate", "CreatedBy" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Ratings_ItemId_Stars",
                table: "Ratings");

            migrationBuilder.DropIndex(
                name: "IX_items_CategoryId_IsPrivate",
                table: "items");

            migrationBuilder.DropIndex(
                name: "IX_items_IsPrivate_CreatedBy",
                table: "items");

            migrationBuilder.DropIndex(
                name: "IX_Categories_IsPrivate",
                table: "Categories");

            migrationBuilder.DropIndex(
                name: "IX_Categories_IsPrivate_CreatedBy",
                table: "Categories");
        }
    }
}
