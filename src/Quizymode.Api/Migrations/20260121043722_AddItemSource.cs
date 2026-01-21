using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddItemSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Source",
                table: "Items",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Source",
                table: "Items");
        }
    }
}
