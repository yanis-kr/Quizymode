using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTrafficClass : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TrafficClass",
                table: "PageViews",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrafficClass",
                table: "MediaReports",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrafficClass",
                table: "AnalyticsEvents",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TrafficClass",
                table: "PageViews");

            migrationBuilder.DropColumn(
                name: "TrafficClass",
                table: "MediaReports");

            migrationBuilder.DropColumn(
                name: "TrafficClass",
                table: "AnalyticsEvents");
        }
    }
}
