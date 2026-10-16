using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class MakeClientErrorSessionFingerprintUnique : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ClientErrors_SessionId_Fingerprint",
                table: "ClientErrors");

            migrationBuilder.CreateIndex(
                name: "IX_ClientErrors_SessionId_Fingerprint",
                table: "ClientErrors",
                columns: new[] { "SessionId", "Fingerprint" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ClientErrors_SessionId_Fingerprint",
                table: "ClientErrors");

            migrationBuilder.CreateIndex(
                name: "IX_ClientErrors_SessionId_Fingerprint",
                table: "ClientErrors",
                columns: new[] { "SessionId", "Fingerprint" });
        }
    }
}
