using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStudyGuideDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsDiscoverable",
                table: "Collections",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Existing shared collections stay listed in Discover; new ones opt in separately (AC 1.9).
            migrationBuilder.Sql("UPDATE \"Collections\" SET \"IsDiscoverable\" = \"IsPublic\";");

            migrationBuilder.CreateTable(
                name: "LlmAttempts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GenerationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Vendor = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Outcome = table.Column<int>(type: "integer", nullable: false),
                    InputTokens = table.Column<int>(type: "integer", nullable: true),
                    OutputTokens = table.Column<int>(type: "integer", nullable: true),
                    DurationMs = table.Column<int>(type: "integer", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LlmAttempts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LlmProviderSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    DeepSeekModel = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    OpenAiModel = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    GeminiModel = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RouteFree = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RoutePremium = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LlmProviderSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SectionGenerations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TextSha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Mode = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PromptVersion = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Tier = table.Column<int>(type: "integer", nullable: false),
                    NotBeforeUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LeaseUntilUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    Vendor = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    InputTokens = table.Column<int>(type: "integer", nullable: true),
                    OutputTokens = table.Column<int>(type: "integer", nullable: true),
                    DroppedCount = table.Column<int>(type: "integer", nullable: false),
                    Error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    SourceText = table.Column<string>(type: "text", nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    QueuedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SectionGenerations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuideDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FileType = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    FileSha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TextSha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PageCount = table.Column<int>(type: "integer", nullable: true),
                    CategoryName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    NavigationKeyword1 = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    NavigationKeyword2 = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    KeywordsJson = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CollectionId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastActivityUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuideDocuments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuideQuotaCharges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    GenerationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChargedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Cost = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuideQuotaCharges", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GenerationCandidates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GenerationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Index = table.Column<int>(type: "integer", nullable: false),
                    Question = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    CorrectAnswer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    IncorrectAnswersJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Explanation = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    SourceQuote = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Page = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GenerationCandidates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GenerationCandidates_SectionGenerations_GenerationId",
                        column: x => x.GenerationId,
                        principalTable: "SectionGenerations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuideAcceptedCandidates",
                columns: table => new
                {
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    AcceptedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuideAcceptedCandidates", x => new { x.DocumentId, x.CandidateId });
                    table.ForeignKey(
                        name: "FK_StudyGuideAcceptedCandidates_StudyGuideDocuments_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "StudyGuideDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuideSections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Index = table.Column<int>(type: "integer", nullable: false),
                    Label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    PageStart = table.Column<int>(type: "integer", nullable: true),
                    PageEnd = table.Column<int>(type: "integer", nullable: true),
                    Text = table.Column<string>(type: "text", nullable: true),
                    TextSha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SizeBytes = table.Column<int>(type: "integer", nullable: false),
                    GenerationId = table.Column<Guid>(type: "uuid", nullable: true),
                    RequestedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuideSections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudyGuideSections_StudyGuideDocuments_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "StudyGuideDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GenerationCandidates_GenerationId_Index",
                table: "GenerationCandidates",
                columns: new[] { "GenerationId", "Index" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LlmAttempts_CreatedUtc",
                table: "LlmAttempts",
                column: "CreatedUtc");

            migrationBuilder.CreateIndex(
                name: "IX_LlmAttempts_GenerationId",
                table: "LlmAttempts",
                column: "GenerationId");

            migrationBuilder.CreateIndex(
                name: "IX_SectionGenerations_QueuedUtc",
                table: "SectionGenerations",
                column: "QueuedUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SectionGenerations_Status_NotBeforeUtc",
                table: "SectionGenerations",
                columns: new[] { "Status", "NotBeforeUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_SectionGenerations_TextSha256_Mode_PromptVersion",
                table: "SectionGenerations",
                columns: new[] { "TextSha256", "Mode", "PromptVersion" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideDocuments_ExpiresUtc",
                table: "StudyGuideDocuments",
                column: "ExpiresUtc");

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideDocuments_UserId_TextSha256",
                table: "StudyGuideDocuments",
                columns: new[] { "UserId", "TextSha256" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideQuotaCharges_GenerationId",
                table: "StudyGuideQuotaCharges",
                column: "GenerationId");

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideQuotaCharges_SectionId",
                table: "StudyGuideQuotaCharges",
                column: "SectionId");

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideQuotaCharges_UserId_ChargedUtc",
                table: "StudyGuideQuotaCharges",
                columns: new[] { "UserId", "ChargedUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideSections_DocumentId_Index",
                table: "StudyGuideSections",
                columns: new[] { "DocumentId", "Index" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudyGuideSections_GenerationId",
                table: "StudyGuideSections",
                column: "GenerationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GenerationCandidates");

            migrationBuilder.DropTable(
                name: "LlmAttempts");

            migrationBuilder.DropTable(
                name: "LlmProviderSettings");

            migrationBuilder.DropTable(
                name: "StudyGuideAcceptedCandidates");

            migrationBuilder.DropTable(
                name: "StudyGuideQuotaCharges");

            migrationBuilder.DropTable(
                name: "StudyGuideSections");

            migrationBuilder.DropTable(
                name: "SectionGenerations");

            migrationBuilder.DropTable(
                name: "StudyGuideDocuments");

            migrationBuilder.DropColumn(
                name: "IsDiscoverable",
                table: "Collections");
        }
    }
}
