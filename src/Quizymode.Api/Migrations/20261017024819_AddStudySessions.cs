using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStudySessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StudySessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RunId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Origin = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Correct = table.Column<int>(type: "integer", nullable: false),
                    Total = table.Column<int>(type: "integer", nullable: false),
                    SourceKind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    SourceCollectionId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceCategorySlug = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    NavigationKeywords = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    FilterKeywords = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudySessions", x => x.Id);
                    table.CheckConstraint("CK_StudySessions_Counts", "\"Total\" > 0 AND \"Correct\" >= 0 AND \"Correct\" <= \"Total\"");
                });

            migrationBuilder.CreateTable(
                name: "StudySessionMissedItems",
                columns: table => new
                {
                    StudySessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudySessionMissedItems", x => new { x.StudySessionId, x.ItemId });
                    table.ForeignKey(
                        name: "FK_StudySessionMissedItems_StudySessions_StudySessionId",
                        column: x => x.StudySessionId,
                        principalTable: "StudySessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StudySessions_UserId_CompletedAt",
                table: "StudySessions",
                columns: new[] { "UserId", "CompletedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StudySessions_UserId_RunId",
                table: "StudySessions",
                columns: new[] { "UserId", "RunId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StudySessionMissedItems");

            migrationBuilder.DropTable(
                name: "StudySessions");
        }
    }
}
