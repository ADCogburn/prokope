namespace server.Tests;

// Verifies the schema that `db.Database.Migrate()` actually produces against
// a real Postgres instance -- not EF Core's in-memory model. See issue #14.
public class SchemaMigrationTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private readonly SchemaInspector _schema = new(fixture.ConnectionString);

    [Theory]
    [InlineData("users")]
    [InlineData("class")]
    [InlineData("subject")]
    [InlineData("lesson")]
    [InlineData("student")]
    [InlineData("progress")]
    [InlineData("class_template")]
    [InlineData("class_template_subject")]
    [InlineData("class_template_lesson")]
    public async Task Table_exists(string table)
    {
        Assert.True(await _schema.TableExistsAsync(table), $"Expected table '{table}' to exist.");
    }

    [Fact]
    public async Task Users_has_expected_columns()
    {
        var columns = await _schema.GetColumnsAsync("users");

        AssertColumn(columns, "id", "uuid", nullable: false);
        AssertColumn(columns, "google_sub", "text", nullable: true);
        AssertColumn(columns, "email", "text", nullable: false);
        AssertColumn(columns, "created_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "is_demo", "boolean", nullable: false);
        Assert.False(columns.ContainsKey("deleted_at"), "users should have no deleted_at column (server-only, no offline-delete scenario).");
    }

    [Fact]
    public async Task Class_has_expected_columns()
    {
        var columns = await _schema.GetColumnsAsync("class");

        AssertColumn(columns, "id", "uuid", nullable: false);
        AssertColumn(columns, "user_id", "uuid", nullable: false);
        AssertColumn(columns, "name", "text", nullable: false);
        AssertColumn(columns, "created_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "updated_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "deleted_at", "timestamp with time zone", nullable: true);
    }

    [Fact]
    public async Task Subject_has_expected_columns()
    {
        var columns = await _schema.GetColumnsAsync("subject");

        AssertColumn(columns, "id", "uuid", nullable: false);
        AssertColumn(columns, "class_id", "uuid", nullable: false);
        AssertColumn(columns, "name", "text", nullable: false);
        AssertColumn(columns, "position", "integer", nullable: false);
        AssertColumn(columns, "created_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "updated_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "deleted_at", "timestamp with time zone", nullable: true);
    }

    [Fact]
    public async Task Lesson_has_expected_columns()
    {
        var columns = await _schema.GetColumnsAsync("lesson");

        AssertColumn(columns, "id", "uuid", nullable: false);
        AssertColumn(columns, "subject_id", "uuid", nullable: false);
        AssertColumn(columns, "unit", "integer", nullable: false);
        AssertColumn(columns, "lesson_in_unit", "integer", nullable: false);
        AssertColumn(columns, "title", "text", nullable: false);
        AssertColumn(columns, "description", "text", nullable: false);
        AssertColumn(columns, "created_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "updated_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "deleted_at", "timestamp with time zone", nullable: true);
    }

    [Fact]
    public async Task Student_has_expected_columns()
    {
        var columns = await _schema.GetColumnsAsync("student");

        AssertColumn(columns, "id", "uuid", nullable: false);
        AssertColumn(columns, "class_id", "uuid", nullable: false);
        AssertColumn(columns, "name", "text", nullable: false);
        AssertColumn(columns, "position", "integer", nullable: false);
        AssertColumn(columns, "created_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "updated_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "deleted_at", "timestamp with time zone", nullable: true);
    }

    [Fact]
    public async Task Progress_has_expected_columns()
    {
        var columns = await _schema.GetColumnsAsync("progress");

        AssertColumn(columns, "id", "uuid", nullable: false);
        AssertColumn(columns, "student_id", "uuid", nullable: false);
        AssertColumn(columns, "subject_id", "uuid", nullable: false);
        AssertColumn(columns, "step_unit", "integer", nullable: false);
        AssertColumn(columns, "step_lesson_in_unit", "integer", nullable: false);
        AssertColumn(columns, "step_hlc", "text", nullable: false);
        AssertColumn(columns, "step_client_id", "uuid", nullable: false);
        AssertColumn(columns, "review", "boolean", nullable: false);
        AssertColumn(columns, "review_hlc", "text", nullable: false);
        AssertColumn(columns, "review_client_id", "uuid", nullable: false);
        AssertColumn(columns, "updated_at", "timestamp with time zone", nullable: false);
        Assert.False(columns.ContainsKey("deleted_at"), "progress should have no deleted_at -- fields are overwritten in place, never removed.");
    }

    [Fact]
    public async Task Class_template_has_expected_columns()
    {
        var columns = await _schema.GetColumnsAsync("class_template");

        AssertColumn(columns, "id", "uuid", nullable: false);
        AssertColumn(columns, "user_id", "uuid", nullable: false);
        AssertColumn(columns, "name", "text", nullable: false);
        AssertColumn(columns, "created_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "updated_at", "timestamp with time zone", nullable: false);
        Assert.False(columns.ContainsKey("deleted_at"), "class_template should have no deleted_at -- immutable, create-only.");
    }

    [Fact]
    public async Task Class_template_subject_has_expected_columns()
    {
        var columns = await _schema.GetColumnsAsync("class_template_subject");

        AssertColumn(columns, "id", "uuid", nullable: false);
        AssertColumn(columns, "class_template_id", "uuid", nullable: false);
        AssertColumn(columns, "name", "text", nullable: false);
        AssertColumn(columns, "position", "integer", nullable: false);
        AssertColumn(columns, "created_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "updated_at", "timestamp with time zone", nullable: false);
        Assert.False(columns.ContainsKey("deleted_at"), "class_template_subject should have no deleted_at -- immutable, create-only.");
    }

    [Fact]
    public async Task Class_template_lesson_has_expected_columns()
    {
        var columns = await _schema.GetColumnsAsync("class_template_lesson");

        AssertColumn(columns, "id", "uuid", nullable: false);
        AssertColumn(columns, "class_template_subject_id", "uuid", nullable: false);
        AssertColumn(columns, "unit", "integer", nullable: false);
        AssertColumn(columns, "lesson_in_unit", "integer", nullable: false);
        AssertColumn(columns, "title", "text", nullable: false);
        AssertColumn(columns, "description", "text", nullable: false);
        AssertColumn(columns, "created_at", "timestamp with time zone", nullable: false);
        AssertColumn(columns, "updated_at", "timestamp with time zone", nullable: false);
        Assert.False(columns.ContainsKey("deleted_at"), "class_template_lesson should have no deleted_at -- immutable, create-only.");
    }

    [Fact]
    public async Task Lesson_is_unique_on_subject_unit_lesson_in_unit()
    {
        var uniqueSets = await _schema.GetUniqueConstraintColumnSetsAsync("lesson");

        Assert.Contains(uniqueSets, set => set.OrderBy(c => c).SequenceEqual(
            new[] { "subject_id", "unit", "lesson_in_unit" }.OrderBy(c => c)));
    }

    [Fact]
    public async Task Progress_is_unique_on_student_and_subject()
    {
        var uniqueSets = await _schema.GetUniqueConstraintColumnSetsAsync("progress");

        Assert.Contains(uniqueSets, set => set.OrderBy(c => c).SequenceEqual(
            new[] { "student_id", "subject_id" }.OrderBy(c => c)));
    }

    [Theory]
    [InlineData("class", "user_id", "users")]
    [InlineData("subject", "class_id", "class")]
    [InlineData("lesson", "subject_id", "subject")]
    [InlineData("student", "class_id", "class")]
    [InlineData("progress", "student_id", "student")]
    [InlineData("progress", "subject_id", "subject")]
    [InlineData("class_template", "user_id", "users")]
    [InlineData("class_template_subject", "class_template_id", "class_template")]
    [InlineData("class_template_lesson", "class_template_subject_id", "class_template_subject")]
    public async Task Foreign_key_resolves_to_parent_table(string table, string column, string expectedParentTable)
    {
        var actualParentTable = await _schema.GetForeignKeyTargetTableAsync(table, column);

        Assert.Equal(expectedParentTable, actualParentTable);
    }

    // class_template_subject/class_template_lesson cascade-delete on their
    // parent (unlike every other FK in this schema, which RESTRICTs) since
    // these three tables have no deleted_at to soft-delete through instead.
    [Theory]
    [InlineData("class_template", "user_id", "RESTRICT")]
    [InlineData("class_template_subject", "class_template_id", "CASCADE")]
    [InlineData("class_template_lesson", "class_template_subject_id", "CASCADE")]
    public async Task Class_template_foreign_key_has_expected_delete_rule(string table, string column, string expectedDeleteRule)
    {
        var actualDeleteRule = await _schema.GetForeignKeyDeleteRuleAsync(table, column);

        Assert.Equal(expectedDeleteRule, actualDeleteRule);
    }

    private static void AssertColumn(
        Dictionary<string, ColumnInfo> columns, string name, string expectedDataType, bool nullable)
    {
        Assert.True(columns.TryGetValue(name, out var column), $"Expected column '{name}' to exist.");
        Assert.Equal(expectedDataType, column!.DataType);
        Assert.Equal(nullable, column.IsNullable);
    }
}
