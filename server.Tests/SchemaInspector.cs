using Npgsql;

namespace server.Tests;

public record ColumnInfo(string DataType, bool IsNullable);

// Thin wrapper over information_schema queries, used to assert on the schema
// a migration actually produced (not on EF Core's in-memory model).
public class SchemaInspector(string connectionString)
{
    public async Task<bool> TableExistsAsync(string table)
    {
        await using var connection = await OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = @table)",
            connection);
        cmd.Parameters.AddWithValue("table", table);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }

    public async Task<Dictionary<string, ColumnInfo>> GetColumnsAsync(string table)
    {
        await using var connection = await OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            select column_name, data_type, is_nullable
            from information_schema.columns
            where table_schema = 'public' and table_name = @table
            """,
            connection);
        cmd.Parameters.AddWithValue("table", table);

        var columns = new Dictionary<string, ColumnInfo>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            columns[reader.GetString(0)] = new ColumnInfo(reader.GetString(1), reader.GetString(2) == "YES");
        }

        return columns;
    }

    // Returns the sorted column sets covered by unique constraints (or the
    // unique index backing the primary key, if included) on the table.
    public async Task<List<string[]>> GetUniqueConstraintColumnSetsAsync(string table)
    {
        await using var connection = await OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            select tc.constraint_name, kcu.column_name
            from information_schema.table_constraints tc
            join information_schema.key_column_usage kcu
              on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
            where tc.table_schema = 'public' and tc.table_name = @table and tc.constraint_type = 'UNIQUE'
            order by kcu.ordinal_position
            """,
            connection);
        cmd.Parameters.AddWithValue("table", table);

        var byConstraint = new Dictionary<string, List<string>>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var constraintName = reader.GetString(0);
            var columnName = reader.GetString(1);
            if (!byConstraint.TryGetValue(constraintName, out var columns))
            {
                columns = [];
                byConstraint[constraintName] = columns;
            }

            columns.Add(columnName);
        }

        return byConstraint.Values.Select(c => c.ToArray()).ToList();
    }

    public async Task<string?> GetForeignKeyTargetTableAsync(string table, string column)
    {
        await using var connection = await OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            select ccu.table_name
            from information_schema.table_constraints tc
            join information_schema.key_column_usage kcu
              on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
            join information_schema.constraint_column_usage ccu
              on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
            where tc.table_schema = 'public' and tc.table_name = @table
              and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = @column
            """,
            connection);
        cmd.Parameters.AddWithValue("table", table);
        cmd.Parameters.AddWithValue("column", column);

        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        return connection;
    }
}
