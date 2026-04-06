using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSeedSyncHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SeedSyncRuns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    RepositoryOwner = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RepositoryName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    GitRef = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ResolvedCommitSha = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ItemsPath = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    SeedSet = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    SourceFileCount = table.Column<int>(type: "integer", nullable: false),
                    TotalItemsInPayload = table.Column<int>(type: "integer", nullable: false),
                    ExistingItemCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedCount = table.Column<int>(type: "integer", nullable: false),
                    UpdatedCount = table.Column<int>(type: "integer", nullable: false),
                    DeletedCount = table.Column<int>(type: "integer", nullable: false),
                    UnchangedCount = table.Column<int>(type: "integer", nullable: false),
                    TriggeredByUserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SeedSyncRuns", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SeedSyncItemHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    SeedSyncRunId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<int>(type: "integer", nullable: false),
                    Category = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NavigationKeyword1 = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    NavigationKeyword2 = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Question = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    ChangedFields = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SeedSyncItemHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SeedSyncItemHistories_SeedSyncRuns_SeedSyncRunId",
                        column: x => x.SeedSyncRunId,
                        principalTable: "SeedSyncRuns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SeedSyncItemHistories_Action",
                table: "SeedSyncItemHistories",
                column: "Action");

            migrationBuilder.CreateIndex(
                name: "IX_SeedSyncItemHistories_CreatedUtc",
                table: "SeedSyncItemHistories",
                column: "CreatedUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SeedSyncItemHistories_ItemId",
                table: "SeedSyncItemHistories",
                column: "ItemId");

            migrationBuilder.CreateIndex(
                name: "IX_SeedSyncItemHistories_SeedSyncRunId",
                table: "SeedSyncItemHistories",
                column: "SeedSyncRunId");

            migrationBuilder.CreateIndex(
                name: "IX_SeedSyncRuns_CreatedUtc",
                table: "SeedSyncRuns",
                column: "CreatedUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SeedSyncRuns_ResolvedCommitSha",
                table: "SeedSyncRuns",
                column: "ResolvedCommitSha");

            migrationBuilder.CreateIndex(
                name: "IX_SeedSyncRuns_TriggeredByUserId",
                table: "SeedSyncRuns",
                column: "TriggeredByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SeedSyncItemHistories");

            migrationBuilder.DropTable(
                name: "SeedSyncRuns");
        }
    }
}
