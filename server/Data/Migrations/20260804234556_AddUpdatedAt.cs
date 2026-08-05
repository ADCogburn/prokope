using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUpdatedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Backfills pre-existing rows to "now" rather than a sentinel default --
            // any row that predates this column genuinely was last touched no later
            // than this migration running, and #7's pull watermark treats updated_at
            // as "what changed recently," not a precise history.
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "subject",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "student",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "progress",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "lesson",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "class",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.CreateIndex(
                name: "ix_subject_updated_at",
                table: "subject",
                column: "updated_at");

            migrationBuilder.CreateIndex(
                name: "ix_student_updated_at",
                table: "student",
                column: "updated_at");

            migrationBuilder.CreateIndex(
                name: "ix_progress_updated_at",
                table: "progress",
                column: "updated_at");

            migrationBuilder.CreateIndex(
                name: "ix_lesson_updated_at",
                table: "lesson",
                column: "updated_at");

            migrationBuilder.CreateIndex(
                name: "ix_class_updated_at",
                table: "class",
                column: "updated_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_subject_updated_at",
                table: "subject");

            migrationBuilder.DropIndex(
                name: "ix_student_updated_at",
                table: "student");

            migrationBuilder.DropIndex(
                name: "ix_progress_updated_at",
                table: "progress");

            migrationBuilder.DropIndex(
                name: "ix_lesson_updated_at",
                table: "lesson");

            migrationBuilder.DropIndex(
                name: "ix_class_updated_at",
                table: "class");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "subject");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "student");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "progress");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "lesson");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "class");
        }
    }
}
