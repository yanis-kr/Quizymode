using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quizymode.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddItemGroupLabel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GroupLabel",
                table: "Items",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GroupLabel",
                table: "Items");
        }
    }
}
