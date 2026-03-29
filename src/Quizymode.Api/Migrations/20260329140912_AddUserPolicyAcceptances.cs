using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserPolicyAcceptances : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UserPolicyAcceptances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PolicyType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PolicyVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    AcceptedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IpAddress = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    UserAgent = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserPolicyAcceptances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserPolicyAcceptances_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserPolicyAcceptances_RecordedAtUtc",
                table: "UserPolicyAcceptances",
                column: "RecordedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_UserPolicyAcceptances_UserId",
                table: "UserPolicyAcceptances",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserPolicyAcceptances_UserId_PolicyType_PolicyVersion",
                table: "UserPolicyAcceptances",
                columns: new[] { "UserId", "PolicyType", "PolicyVersion" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserPolicyAcceptances");
        }
    }
}
