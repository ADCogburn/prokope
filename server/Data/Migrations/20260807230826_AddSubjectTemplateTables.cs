using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSubjectTemplateTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "subject_template",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_subject_template", x => x.id);
                    table.ForeignKey(
                        name: "fk_subject_template_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "subject_template_lesson",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    subject_template_id = table.Column<Guid>(type: "uuid", nullable: false),
                    unit = table.Column<int>(type: "integer", nullable: false),
                    lesson_in_unit = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_subject_template_lesson", x => x.id);
                    table.ForeignKey(
                        name: "fk_subject_template_lesson_subject_template_subject_template_id",
                        column: x => x.subject_template_id,
                        principalTable: "subject_template",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_subject_template_updated_at",
                table: "subject_template",
                column: "updated_at");

            migrationBuilder.CreateIndex(
                name: "ix_subject_template_user_id",
                table: "subject_template",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_subject_template_lesson_subject_template_id",
                table: "subject_template_lesson",
                column: "subject_template_id");

            migrationBuilder.CreateIndex(
                name: "ix_subject_template_lesson_updated_at",
                table: "subject_template_lesson",
                column: "updated_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "subject_template_lesson");

            migrationBuilder.DropTable(
                name: "subject_template");
        }
    }
}
