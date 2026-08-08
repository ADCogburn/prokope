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

    // Returns the sorted column sets covered by unique indexes on the table --
    // this includes both `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE` constraints
    // and bare `CREATE UNIQUE INDEX` indexes (e.g. from EF's HasIndex().IsUnique()),
    // since Postgres only records the former in information_schema.table_constraints.
    public async Task<List<string[]>> GetUniqueConstraintColumnSetsAsync(string table)
    {
        await using var connection = await OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            select i.relname as index_name, a.attname as column_name
            from pg_index ix
            join pg_class t on t.oid = ix.indrelid
            join pg_class i on i.oid = ix.indexrelid
            join pg_namespace n on n.oid = t.relnamespace
            cross join lateral unnest(ix.indkey::int2[]) with ordinality as k(attnum, ord)
            join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
            where n.nspname = 'public' and t.relname = @table and ix.indisunique
            order by i.relname, k.ord
            """,
            connection);
        cmd.Parameters.AddWithValue("table", table);

        var byIndex = new Dictionary<string, List<string>>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var indexName = reader.GetString(0);
            var columnName = reader.GetString(1);
            if (!byIndex.TryGetValue(indexName, out var columns))
            {
                columns = [];
                byIndex[indexName] = columns;
            }

            columns.Add(columnName);
        }

        return byIndex.Values.Select(c => c.ToArray()).ToList();
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

    // The delete rule ('CASCADE', 'RESTRICT', 'NO ACTION', ...) Postgres will
    // enforce for the named FK column, per information_schema.referential_constraints.
    public async Task<string?> GetForeignKeyDeleteRuleAsync(string table, string column)
    {
        await using var connection = await OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            select rc.delete_rule
            from information_schema.table_constraints tc
            join information_schema.key_column_usage kcu
              on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
            join information_schema.referential_constraints rc
              on tc.constraint_name = rc.constraint_name and tc.table_schema = rc.constraint_schema
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
