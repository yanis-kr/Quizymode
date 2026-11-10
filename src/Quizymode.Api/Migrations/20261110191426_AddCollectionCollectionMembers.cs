using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCollectionCollectionMembers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CollectionCollectionMembers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChildId = table.Column<Guid>(type: "uuid", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionCollectionMembers", x => x.Id);
                    table.CheckConstraint("CK_CollectionCollectionMembers_NoSelf", "\"ParentId\" <> \"ChildId\"");
                    table.ForeignKey(
                        name: "FK_CollectionCollectionMembers_Collections_ChildId",
                        column: x => x.ChildId,
                        principalTable: "Collections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CollectionCollectionMembers_Collections_ParentId",
                        column: x => x.ParentId,
                        principalTable: "Collections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CollectionCollectionMembers_ChildId",
                table: "CollectionCollectionMembers",
                column: "ChildId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionCollectionMembers_ParentId_ChildId",
                table: "CollectionCollectionMembers",
                columns: new[] { "ParentId", "ChildId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CollectionCollectionMembers");
        }
    }
}
