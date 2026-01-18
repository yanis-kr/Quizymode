using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class RenameTablesToPascalCase : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_item_keywords_items_ItemId",
                table: "item_keywords");

            migrationBuilder.DropForeignKey(
                name: "FK_item_keywords_keywords_KeywordId",
                table: "item_keywords");

            migrationBuilder.DropForeignKey(
                name: "FK_items_Categories_CategoryId",
                table: "items");

            migrationBuilder.DropPrimaryKey(
                name: "PK_keywords",
                table: "keywords");

            migrationBuilder.DropPrimaryKey(
                name: "PK_items",
                table: "items");

            migrationBuilder.RenameTable(
                name: "keywords",
                newName: "Keywords");

            migrationBuilder.RenameTable(
                name: "items",
                newName: "Items");

            migrationBuilder.RenameIndex(
                name: "IX_keywords_Name_CreatedBy_IsPrivate",
                table: "Keywords",
                newName: "IX_Keywords_Name_CreatedBy_IsPrivate");

            migrationBuilder.RenameIndex(
                name: "IX_keywords_IsPrivate",
                table: "Keywords",
                newName: "IX_Keywords_IsPrivate");

            migrationBuilder.RenameIndex(
                name: "IX_keywords_CreatedBy",
                table: "Keywords",
                newName: "IX_Keywords_CreatedBy");

            migrationBuilder.RenameIndex(
                name: "IX_items_IsPrivate_CreatedBy",
                table: "Items",
                newName: "IX_Items_IsPrivate_CreatedBy");

            migrationBuilder.RenameIndex(
                name: "IX_items_FuzzyBucket",
                table: "Items",
                newName: "IX_Items_FuzzyBucket");

            migrationBuilder.RenameIndex(
                name: "IX_items_CreatedAt",
                table: "Items",
                newName: "IX_Items_CreatedAt");

            migrationBuilder.RenameIndex(
                name: "IX_items_CategoryId_IsPrivate",
                table: "Items",
                newName: "IX_Items_CategoryId_IsPrivate");

            migrationBuilder.RenameIndex(
                name: "IX_items_CategoryId",
                table: "Items",
                newName: "IX_Items_CategoryId");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Keywords",
                table: "Keywords",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Items",
                table: "Items",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_item_keywords_Items_ItemId",
                table: "item_keywords",
                column: "ItemId",
                principalTable: "Items",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_item_keywords_Keywords_KeywordId",
                table: "item_keywords",
                column: "KeywordId",
                principalTable: "Keywords",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Items_Categories_CategoryId",
                table: "Items",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_item_keywords_Items_ItemId",
                table: "item_keywords");

            migrationBuilder.DropForeignKey(
                name: "FK_item_keywords_Keywords_KeywordId",
                table: "item_keywords");

            migrationBuilder.DropForeignKey(
                name: "FK_Items_Categories_CategoryId",
                table: "Items");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Keywords",
                table: "Keywords");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Items",
                table: "Items");

            migrationBuilder.RenameTable(
                name: "Keywords",
                newName: "keywords");

            migrationBuilder.RenameTable(
                name: "Items",
                newName: "items");

            migrationBuilder.RenameIndex(
                name: "IX_Keywords_Name_CreatedBy_IsPrivate",
                table: "keywords",
                newName: "IX_keywords_Name_CreatedBy_IsPrivate");

            migrationBuilder.RenameIndex(
                name: "IX_Keywords_IsPrivate",
                table: "keywords",
                newName: "IX_keywords_IsPrivate");

            migrationBuilder.RenameIndex(
                name: "IX_Keywords_CreatedBy",
                table: "keywords",
                newName: "IX_keywords_CreatedBy");

            migrationBuilder.RenameIndex(
                name: "IX_Items_IsPrivate_CreatedBy",
                table: "items",
                newName: "IX_items_IsPrivate_CreatedBy");

            migrationBuilder.RenameIndex(
                name: "IX_Items_FuzzyBucket",
                table: "items",
                newName: "IX_items_FuzzyBucket");

            migrationBuilder.RenameIndex(
                name: "IX_Items_CreatedAt",
                table: "items",
                newName: "IX_items_CreatedAt");

            migrationBuilder.RenameIndex(
                name: "IX_Items_CategoryId_IsPrivate",
                table: "items",
                newName: "IX_items_CategoryId_IsPrivate");

            migrationBuilder.RenameIndex(
                name: "IX_Items_CategoryId",
                table: "items",
                newName: "IX_items_CategoryId");

            migrationBuilder.AddPrimaryKey(
                name: "PK_keywords",
                table: "keywords",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_items",
                table: "items",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_item_keywords_items_ItemId",
                table: "item_keywords",
                column: "ItemId",
                principalTable: "items",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_item_keywords_keywords_KeywordId",
                table: "item_keywords",
                column: "KeywordId",
                principalTable: "keywords",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_items_Categories_CategoryId",
                table: "items",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
