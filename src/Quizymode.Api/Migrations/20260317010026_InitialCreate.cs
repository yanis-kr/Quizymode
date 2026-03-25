using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Audits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    IpAddress = table.Column<string>(type: "character varying(45)", maxLength: 45, nullable: false),
                    Action = table.Column<int>(type: "integer", nullable: false),
                    EntityId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Metadata = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Audits", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Categories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ShortDescription = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    IsPrivate = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Categories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CollectionBookmarks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    CollectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionBookmarks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CollectionItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CollectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CollectionRatings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
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

            migrationBuilder.CreateTable(
                name: "Collections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Collections", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CollectionShares",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CollectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SharedBy = table.Column<string>(type: "text", nullable: false),
                    SharedWithUserId = table.Column<string>(type: "text", nullable: true),
                    SharedWithEmail = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollectionShares", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Comments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Text = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Comments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Keywords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    IsPrivate = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Keywords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Ratings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Stars = table.Column<int>(type: "integer", nullable: true),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Ratings", x => x.Id);
                    table.CheckConstraint("CK_Ratings_Stars_Range", "\"Stars\" IS NULL OR (\"Stars\" >= 1 AND \"Stars\" <= 5)");
                });

            migrationBuilder.CreateTable(
                name: "Requests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CategoryId = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Requests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ContentText = table.Column<string>(type: "text", nullable: false),
                    SizeBytes = table.Column<int>(type: "integer", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudyGuides", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Uploads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    InputText = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Uploads", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    LastLogin = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Items",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    IsPrivate = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    Question = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    CorrectAnswer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    IncorrectAnswers = table.Column<string>(type: "jsonb", nullable: false),
                    Explanation = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    FuzzySignature = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    FuzzyBucket = table.Column<int>(type: "integer", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReadyForReview = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    Source = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    UploadId = table.Column<Guid>(type: "uuid", nullable: true),
                    FactualRisk = table.Column<decimal>(type: "numeric(5,4)", precision: 5, scale: 4, nullable: true),
                    ReviewComments = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Items", x => x.Id);
                    table.CheckConstraint("CK_Items_IncorrectAnswers_Length", "jsonb_array_length(\"IncorrectAnswers\"::jsonb) >= 0 AND jsonb_array_length(\"IncorrectAnswers\"::jsonb) <= 4");
                    table.ForeignKey(
                        name: "FK_Items_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "CategoryKeywords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    KeywordId = table.Column<Guid>(type: "uuid", nullable: false),
                    NavigationRank = table.Column<int>(type: "integer", nullable: true),
                    ParentName = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    SortRank = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CategoryKeywords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CategoryKeywords_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CategoryKeywords_Keywords_KeywordId",
                        column: x => x.KeywordId,
                        principalTable: "Keywords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuideImportSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    StudyGuideId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CategoryName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    NavigationKeywordPathJson = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    DefaultKeywordsJson = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    TargetItemsPerChunk = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
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
                name: "UserSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Value = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserSettings_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ItemKeywords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    KeywordId = table.Column<Guid>(type: "uuid", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ItemKeywords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ItemKeywords_Items_ItemId",
                        column: x => x.ItemId,
                        principalTable: "Items",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ItemKeywords_Keywords_KeywordId",
                        column: x => x.KeywordId,
                        principalTable: "Keywords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StudyGuideChunks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ImportSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChunkIndex = table.Column<int>(type: "integer", nullable: false),
                    Title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ChunkText = table.Column<string>(type: "text", nullable: false),
                    SizeBytes = table.Column<int>(type: "integer", nullable: false),
                    PromptText = table.Column<string>(type: "text", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
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
                    RawDedupResponseText = table.Column<string>(type: "text", nullable: false),
                    ParsedDedupItemsJson = table.Column<string>(type: "text", nullable: true),
                    ValidationStatus = table.Column<int>(type: "integer", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
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
                    RawResponseText = table.Column<string>(type: "text", nullable: false),
                    ParsedItemsJson = table.Column<string>(type: "text", nullable: true),
                    ValidationStatus = table.Column<int>(type: "integer", nullable: false),
                    ValidationMessagesJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
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
                name: "IX_Audits_Action",
                table: "Audits",
                column: "Action");

            migrationBuilder.CreateIndex(
                name: "IX_Audits_CreatedUtc",
                table: "Audits",
                column: "CreatedUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Audits_EntityId",
                table: "Audits",
                column: "EntityId");

            migrationBuilder.CreateIndex(
                name: "IX_Audits_UserId",
                table: "Audits",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Categories_IsPrivate",
                table: "Categories",
                column: "IsPrivate");

            migrationBuilder.CreateIndex(
                name: "IX_Categories_IsPrivate_CreatedBy",
                table: "Categories",
                columns: new[] { "IsPrivate", "CreatedBy" });

            migrationBuilder.CreateIndex(
                name: "IX_Categories_Name",
                table: "Categories",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywords_CategoryId_KeywordId",
                table: "CategoryKeywords",
                columns: new[] { "CategoryId", "KeywordId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywords_CategoryId_NavigationRank",
                table: "CategoryKeywords",
                columns: new[] { "CategoryId", "NavigationRank" });

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywords_CategoryId_ParentName",
                table: "CategoryKeywords",
                columns: new[] { "CategoryId", "ParentName" });

            migrationBuilder.CreateIndex(
                name: "IX_CategoryKeywords_KeywordId",
                table: "CategoryKeywords",
                column: "KeywordId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionBookmarks_CollectionId",
                table: "CollectionBookmarks",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionBookmarks_UserId",
                table: "CollectionBookmarks",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionBookmarks_UserId_CollectionId",
                table: "CollectionBookmarks",
                columns: new[] { "UserId", "CollectionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CollectionRatings_CollectionId",
                table: "CollectionRatings",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionRatings_CollectionId_CreatedBy",
                table: "CollectionRatings",
                columns: new[] { "CollectionId", "CreatedBy" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CollectionShares_CollectionId",
                table: "CollectionShares",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionShares_SharedWithEmail",
                table: "CollectionShares",
                column: "SharedWithEmail");

            migrationBuilder.CreateIndex(
                name: "IX_CollectionShares_SharedWithUserId",
                table: "CollectionShares",
                column: "SharedWithUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Comments_CreatedAt",
                table: "Comments",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Comments_ItemId",
                table: "Comments",
                column: "ItemId");

            migrationBuilder.CreateIndex(
                name: "IX_ItemKeywords_ItemId",
                table: "ItemKeywords",
                column: "ItemId");

            migrationBuilder.CreateIndex(
                name: "IX_ItemKeywords_ItemId_KeywordId",
                table: "ItemKeywords",
                columns: new[] { "ItemId", "KeywordId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ItemKeywords_KeywordId",
                table: "ItemKeywords",
                column: "KeywordId");

            migrationBuilder.CreateIndex(
                name: "IX_Items_CategoryId",
                table: "Items",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Items_CategoryId_IsPrivate",
                table: "Items",
                columns: new[] { "CategoryId", "IsPrivate" });

            migrationBuilder.CreateIndex(
                name: "IX_Items_CreatedAt",
                table: "Items",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Items_FuzzyBucket",
                table: "Items",
                column: "FuzzyBucket");

            migrationBuilder.CreateIndex(
                name: "IX_Items_IsPrivate_CreatedBy",
                table: "Items",
                columns: new[] { "IsPrivate", "CreatedBy" });

            migrationBuilder.CreateIndex(
                name: "IX_Items_UploadId",
                table: "Items",
                column: "UploadId");

            migrationBuilder.CreateIndex(
                name: "IX_Keywords_CreatedBy",
                table: "Keywords",
                column: "CreatedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Keywords_IsPrivate",
                table: "Keywords",
                column: "IsPrivate");

            migrationBuilder.CreateIndex(
                name: "IX_Keywords_Name_CreatedBy_IsPrivate",
                table: "Keywords",
                columns: new[] { "Name", "CreatedBy", "IsPrivate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Ratings_ItemId",
                table: "Ratings",
                column: "ItemId");

            migrationBuilder.CreateIndex(
                name: "IX_Ratings_ItemId_CreatedBy",
                table: "Ratings",
                columns: new[] { "ItemId", "CreatedBy" });

            migrationBuilder.CreateIndex(
                name: "IX_Ratings_ItemId_Stars",
                table: "Ratings",
                columns: new[] { "ItemId", "Stars" });

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
                name: "IX_Uploads_CreatedAt",
                table: "Uploads",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Uploads_UserId_Hash",
                table: "Uploads",
                columns: new[] { "UserId", "Hash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true,
                filter: "\"Email\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Name",
                table: "Users",
                column: "Name",
                unique: true,
                filter: "\"Name\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Subject",
                table: "Users",
                column: "Subject",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserSettings_UserId",
                table: "UserSettings",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserSettings_UserId_Key",
                table: "UserSettings",
                columns: new[] { "UserId", "Key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Audits");

            migrationBuilder.DropTable(
                name: "CategoryKeywords");

            migrationBuilder.DropTable(
                name: "CollectionBookmarks");

            migrationBuilder.DropTable(
                name: "CollectionItems");

            migrationBuilder.DropTable(
                name: "CollectionRatings");

            migrationBuilder.DropTable(
                name: "Collections");

            migrationBuilder.DropTable(
                name: "CollectionShares");

            migrationBuilder.DropTable(
                name: "Comments");

            migrationBuilder.DropTable(
                name: "ItemKeywords");

            migrationBuilder.DropTable(
                name: "Ratings");

            migrationBuilder.DropTable(
                name: "Requests");

            migrationBuilder.DropTable(
                name: "StudyGuideChunks");

            migrationBuilder.DropTable(
                name: "StudyGuideDedupResults");

            migrationBuilder.DropTable(
                name: "StudyGuidePromptResults");

            migrationBuilder.DropTable(
                name: "Uploads");

            migrationBuilder.DropTable(
                name: "UserSettings");

            migrationBuilder.DropTable(
                name: "Items");

            migrationBuilder.DropTable(
                name: "Keywords");

            migrationBuilder.DropTable(
                name: "StudyGuideImportSessions");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "Categories");

            migrationBuilder.DropTable(
                name: "StudyGuides");
        }
    }
}
