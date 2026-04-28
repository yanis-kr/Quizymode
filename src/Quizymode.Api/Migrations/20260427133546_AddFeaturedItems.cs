using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFeaturedItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FeaturedItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CategorySlug = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    NavKeyword1 = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    NavKeyword2 = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CollectionId = table.Column<Guid>(type: "uuid", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FeaturedItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FeaturedItems_Collections_CollectionId",
                        column: x => x.CollectionId,
                        principalTable: "Collections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FeaturedItems_CollectionId",
                table: "FeaturedItems",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_FeaturedItems_SortOrder",
                table: "FeaturedItems",
                column: "SortOrder");

            migrationBuilder.CreateIndex(
                name: "IX_FeaturedItems_Type",
                table: "FeaturedItems",
                column: "Type");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FeaturedItems");
        }
    }
}
