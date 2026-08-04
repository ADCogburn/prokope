using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace server.Tests;

// Spins up a real, ephemeral Postgres instance and boots the actual app
// (via WebApplicationFactory<Program>) against it, so tests assert on the
// schema that the real startup path in Program.cs -- including its
// db.Database.Migrate() call -- actually produces, not a hand-rolled
// DbContext built only for the test.
public class DatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:16-alpine").Build();

    private WebApplicationFactory<Program>? _factory;

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        try
        {
            _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
                builder.ConfigureAppConfiguration((_, config) =>
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["ConnectionStrings:Default"] = ConnectionString,
                    })));

            // Accessing Services forces the host to build, which runs Program.cs's
            // startup path -- including db.Database.Migrate() -- against the
            // container above.
            using var scope = _factory.Services.CreateScope();
        }
        catch
        {
            // xUnit does not reliably call DisposeAsync on a fixture whose
            // InitializeAsync faulted, so tear down whatever we started ourselves.
            if (_factory is not null)
            {
                await _factory.DisposeAsync();
            }

            await _container.DisposeAsync();
            throw;
        }
    }

    public async Task DisposeAsync()
    {
        if (_factory is not null)
        {
            await _factory.DisposeAsync();
        }

        await _container.DisposeAsync();
    }
}
