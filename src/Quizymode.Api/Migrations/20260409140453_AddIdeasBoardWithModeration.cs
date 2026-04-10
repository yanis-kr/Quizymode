using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddIdeasBoardWithModeration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Ideas",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Problem = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    ProposedChange = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    TradeOffs = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ModerationState = table.Column<int>(type: "integer", nullable: false),
                    ModerationNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Ideas", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "IdeaComments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    IdeaId = table.Column<Guid>(type: "uuid", nullable: false),
                    Text = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaComments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IdeaComments_Ideas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "Ideas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IdeaRatings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    IdeaId = table.Column<Guid>(type: "uuid", nullable: false),
                    Stars = table.Column<int>(type: "integer", nullable: true),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaRatings", x => x.Id);
                    table.CheckConstraint("CK_IdeaRatings_Stars_Range", "\"Stars\" IS NULL OR (\"Stars\" >= 1 AND \"Stars\" <= 5)");
                    table.ForeignKey(
                        name: "FK_IdeaRatings_Ideas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "Ideas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IdeaComments_CreatedAt",
                table: "IdeaComments",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_IdeaComments_IdeaId",
                table: "IdeaComments",
                column: "IdeaId");

            migrationBuilder.CreateIndex(
                name: "IX_IdeaRatings_IdeaId",
                table: "IdeaRatings",
                column: "IdeaId");

            migrationBuilder.CreateIndex(
                name: "IX_IdeaRatings_IdeaId_CreatedBy",
                table: "IdeaRatings",
                columns: new[] { "IdeaId", "CreatedBy" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_IdeaRatings_IdeaId_Stars",
                table: "IdeaRatings",
                columns: new[] { "IdeaId", "Stars" });

            migrationBuilder.CreateIndex(
                name: "IX_Ideas_CreatedAt",
                table: "Ideas",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Ideas_CreatedBy",
                table: "Ideas",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Ideas_CreatedBy_ModerationState",
                table: "Ideas",
                columns: new[] { "CreatedBy", "ModerationState" });

            migrationBuilder.CreateIndex(
                name: "IX_Ideas_ModerationState",
                table: "Ideas",
                column: "ModerationState");

            migrationBuilder.CreateIndex(
                name: "IX_Ideas_Status",
                table: "Ideas",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_Ideas_UpdatedAt",
                table: "Ideas",
                column: "UpdatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IdeaComments");

            migrationBuilder.DropTable(
                name: "IdeaRatings");

            migrationBuilder.DropTable(
                name: "Ideas");
        }
    }
}
