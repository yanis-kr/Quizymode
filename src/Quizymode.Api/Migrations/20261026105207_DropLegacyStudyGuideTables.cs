using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class DropLegacyStudyGuideTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StudyGuideChunks");

            migrationBuilder.DropTable(
                name: "StudyGuideDedupResults");

            migrationBuilder.DropTable(
                name: "StudyGuidePromptResults");

            migrationBuilder.DropTable(
                name: "StudyGuideUploads");

            migrationBuilder.DropTable(
                name: "StudyGuideImportSessions");

            migrationBuilder.DropTable(
                name: "StudyGuides");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StudyGuides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ContentText = table.Column<string>(type: "text", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SizeBytes = table.Column<int>(type: "integer", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuides", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuideUploads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AcceptedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    CategoryName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CompletedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedItemCount = table.Column<int>(type: "integer", nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Error = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    GeneratedQuestionsJson = table.Column<string>(type: "text", nullable: true),
                    InputText = table.Column<string>(type: "text", nullable: false),
                    KeywordsJson = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    NavigationKeyword1 = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    NavigationKeyword2 = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    TextHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuideUploads", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuideImportSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    StudyGuideId = table.Column<Guid>(type: "uuid", nullable: false),
                    CategoryName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DefaultKeywordsJson = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    NavigationKeywordPathJson = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    TargetItemsPerChunk = table.Column<int>(type: "integer", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuideImportSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudyGuideImportSessions_StudyGuides_StudyGuideId",
                        column: x => x.StudyGuideId,
                        principalTable: "StudyGuides",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuideChunks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ImportSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChunkIndex = table.Column<int>(type: "integer", nullable: false),
                    ChunkText = table.Column<string>(type: "text", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PromptText = table.Column<string>(type: "text", nullable: false),
                    SizeBytes = table.Column<int>(type: "integer", nullable: false),
                    Title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuideChunks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudyGuideChunks_StudyGuideImportSessions_ImportSessionId",
                        column: x => x.ImportSessionId,
                        principalTable: "StudyGuideImportSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuideDedupResults",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ImportSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ParsedDedupItemsJson = table.Column<string>(type: "text", nullable: true),
                    RawDedupResponseText = table.Column<string>(type: "text", nullable: false),
                    ValidationStatus = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuideDedupResults", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudyGuideDedupResults_StudyGuideImportSessions_ImportSessi~",
                        column: x => x.ImportSessionId,
                        principalTable: "StudyGuideImportSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuidePromptResults",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ImportSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChunkIndex = table.Column<int>(type: "integer", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ParsedItemsJson = table.Column<string>(type: "text", nullable: true),
                    RawResponseText = table.Column<string>(type: "text", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ValidationMessagesJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    ValidationStatus = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuidePromptResults", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudyGuidePromptResults_StudyGuideImportSessions_ImportSess~",
                        column: x => x.ImportSessionId,
                        principalTable: "StudyGuideImportSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideChunks_ImportSessionId_ChunkIndex",
                table: "StudyGuideChunks",
                columns: new[] { "ImportSessionId", "ChunkIndex" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideDedupResults_ImportSessionId",
                table: "StudyGuideDedupResults",
                column: "ImportSessionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideImportSessions_StudyGuideId",
                table: "StudyGuideImportSessions",
                column: "StudyGuideId");

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideImportSessions_UserId",
                table: "StudyGuideImportSessions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuidePromptResults_ImportSessionId_ChunkIndex",
                table: "StudyGuidePromptResults",
                columns: new[] { "ImportSessionId", "ChunkIndex" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuides_UserId",
                table: "StudyGuides",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideUploads_Status",
                table: "StudyGuideUploads",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideUploads_UserId_TextHash",
                table: "StudyGuideUploads",
                columns: new[] { "UserId", "TextHash" },
                unique: true);
        }
    }
}
