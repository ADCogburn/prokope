using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace server.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    google_sub = table.Column<string>(type: "text", nullable: false),
                    email = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "class",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    deleted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_class", x => x.id);
                    table.ForeignKey(
                        name: "fk_class_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "student",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    class_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    deleted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_student", x => x.id);
                    table.ForeignKey(
                        name: "fk_student_class_class_id",
                        column: x => x.class_id,
                        principalTable: "class",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "subject",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    class_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    deleted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_subject", x => x.id);
                    table.ForeignKey(
                        name: "fk_subject_class_class_id",
                        column: x => x.class_id,
                        principalTable: "class",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "lesson",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    subject_id = table.Column<Guid>(type: "uuid", nullable: false),
                    unit = table.Column<int>(type: "integer", nullable: false),
                    lesson_in_unit = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    deleted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_lesson", x => x.id);
                    table.ForeignKey(
                        name: "fk_lesson_subject_subject_id",
                        column: x => x.subject_id,
                        principalTable: "subject",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "progress",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    student_id = table.Column<Guid>(type: "uuid", nullable: false),
                    subject_id = table.Column<Guid>(type: "uuid", nullable: false),
                    step_unit = table.Column<int>(type: "integer", nullable: false),
                    step_lesson_in_unit = table.Column<int>(type: "integer", nullable: false),
                    step_hlc = table.Column<string>(type: "text", nullable: false),
                    step_client_id = table.Column<Guid>(type: "uuid", nullable: false),
                    review = table.Column<bool>(type: "boolean", nullable: false),
                    review_hlc = table.Column<string>(type: "text", nullable: false),
                    review_client_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_progress", x => x.id);
                    table.ForeignKey(
                        name: "fk_progress_student_student_id",
                        column: x => x.student_id,
                        principalTable: "student",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_progress_subject_subject_id",
                        column: x => x.subject_id,
                        principalTable: "subject",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_class_user_id",
                table: "class",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_lesson_subject_id_unit_lesson_in_unit",
                table: "lesson",
                columns: new[] { "subject_id", "unit", "lesson_in_unit" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_progress_student_id_subject_id",
                table: "progress",
                columns: new[] { "student_id", "subject_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_progress_subject_id",
                table: "progress",
                column: "subject_id");

            migrationBuilder.CreateIndex(
                name: "ix_student_class_id",
                table: "student",
                column: "class_id");

            migrationBuilder.CreateIndex(
                name: "ix_subject_class_id",
                table: "subject",
                column: "class_id");

            migrationBuilder.CreateIndex(
                name: "ix_users_google_sub",
                table: "users",
                column: "google_sub",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "lesson");

            migrationBuilder.DropTable(
                name: "progress");

            migrationBuilder.DropTable(
                name: "student");

            migrationBuilder.DropTable(
                name: "subject");

            migrationBuilder.DropTable(
                name: "class");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
