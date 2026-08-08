using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddClassTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "class_template",
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
                    table.PrimaryKey("pk_class_template", x => x.id);
                    table.ForeignKey(
                        name: "fk_class_template_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "class_template_subject",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    class_template_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_class_template_subject", x => x.id);
                    table.ForeignKey(
                        name: "fk_class_template_subject_class_template_class_template_id",
                        column: x => x.class_template_id,
                        principalTable: "class_template",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "class_template_lesson",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    class_template_subject_id = table.Column<Guid>(type: "uuid", nullable: false),
                    unit = table.Column<int>(type: "integer", nullable: false),
                    lesson_in_unit = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_class_template_lesson", x => x.id);
                    table.ForeignKey(
                        name: "fk_class_template_lesson_class_template_subject_class_template",
                        column: x => x.class_template_subject_id,
                        principalTable: "class_template_subject",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_class_template_updated_at",
                table: "class_template",
                column: "updated_at");

            migrationBuilder.CreateIndex(
                name: "ix_class_template_user_id",
                table: "class_template",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_template_lesson_class_template_subject_id",
                table: "class_template_lesson",
                column: "class_template_subject_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_template_lesson_updated_at",
                table: "class_template_lesson",
                column: "updated_at");

            migrationBuilder.CreateIndex(
                name: "ix_class_template_subject_class_template_id",
                table: "class_template_subject",
                column: "class_template_id");

            migrationBuilder.CreateIndex(
                name: "ix_class_template_subject_updated_at",
                table: "class_template_subject",
                column: "updated_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "class_template_lesson");

            migrationBuilder.DropTable(
                name: "class_template_subject");

            migrationBuilder.DropTable(
                name: "class_template");
        }
    }
}
