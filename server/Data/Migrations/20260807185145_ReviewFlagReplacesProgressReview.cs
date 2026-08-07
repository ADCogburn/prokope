using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace server.Data.Migrations
{
    /// <inheritdoc />
    public partial class ReviewFlagReplacesProgressReview : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "review",
                table: "progress");

            migrationBuilder.DropColumn(
                name: "review_client_id",
                table: "progress");

            migrationBuilder.DropColumn(
                name: "review_hlc",
                table: "progress");

            migrationBuilder.CreateTable(
                name: "review_flag",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    student_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lesson_id = table.Column<Guid>(type: "uuid", nullable: false),
                    flagged = table.Column<bool>(type: "boolean", nullable: false),
                    hlc = table.Column<string>(type: "text", nullable: false),
                    client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_review_flag", x => x.id);
                    table.ForeignKey(
                        name: "fk_review_flag_lesson_lesson_id",
                        column: x => x.lesson_id,
                        principalTable: "lesson",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_review_flag_student_student_id",
                        column: x => x.student_id,
                        principalTable: "student",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_review_flag_lesson_id",
                table: "review_flag",
                column: "lesson_id");

            migrationBuilder.CreateIndex(
                name: "ix_review_flag_student_id_lesson_id",
                table: "review_flag",
                columns: new[] { "student_id", "lesson_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_review_flag_updated_at",
                table: "review_flag",
                column: "updated_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "review_flag");

            migrationBuilder.AddColumn<bool>(
                name: "review",
                table: "progress",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "review_client_id",
                table: "progress",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<string>(
                name: "review_hlc",
                table: "progress",
                type: "text",
                nullable: false,
                defaultValue: "");
        }
    }
}
