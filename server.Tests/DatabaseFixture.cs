using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using server.Auth;
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

    // Fixed rather than read from appsettings.Development.json, so CorsTests
    // doesn't depend on which environment WebApplicationFactory happens to boot.
    public const string AllowedSpaOrigin = "http://localhost:5173";

    // Fixed and exposed so auth tests can mint their own tokens (e.g. an
    // already-expired one) that validate against the same signing
    // parameters the running app uses.
    public const string JwtSigningKey = "test-fixture-signing-key-not-used-anywhere-else-0123456789";
    public const string JwtIssuer = "prokope-api-test";

    // Program.cs fails fast at startup if Google:ClientId is unset (see
    // #18); the real GoogleTokenVerifier is replaced by the stub below, so
    // this value is never actually used to validate a token audience.
    public const string GoogleClientId = "test-fixture-google-client-id";

    // Overridden by DemoAccountDisabledDatabaseFixture to exercise the
    // App:DemoAccountEnabled=false path -- that variant boots its own
    // Postgres container, since the flag is only read by Program.cs at
    // WebApplicationFactory build time.
    protected virtual bool DemoAccountEnabled => true;

    public HttpClient CreateClient() => _factory!.CreateClient();

    // Exposes the running app's DI container so tests can assert directly
    // against the database (e.g. demo-seeded rows) without a dedicated
    // read endpoint for every entity.
    public IServiceProvider Services => _factory!.Services;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        try
        {
            _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.ConfigureAppConfiguration((_, config) =>
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["ConnectionStrings:Default"] = ConnectionString,
                        ["Cors:SpaOrigins"] = AllowedSpaOrigin,
                        ["Jwt:SigningKey"] = JwtSigningKey,
                        ["Jwt:Issuer"] = JwtIssuer,
                        ["Google:ClientId"] = GoogleClientId,
                        ["App:DemoAccountEnabled"] = DemoAccountEnabled ? "true" : "false",
                    }));

                // The real GoogleTokenVerifier calls out to Google's network;
                // tests exercise the endpoint logic against a stub instead,
                // per #18's testing decisions.
                builder.ConfigureServices(services =>
                    services.Replace(ServiceDescriptor.Scoped<IGoogleTokenVerifier, StubGoogleTokenVerifier>()));
            });

            // Accessing Services forces the host to build, which runs Program.cs's
            // startup path -- including db.Database.Migrate() -- against the
            // container above.
            using var scope = _factory.Services.CreateScope();
        }
        catch
        {
            // xUnit does not reliably call DisposeAsync on a fixture whose
            // InitializeAsync faulted, so tear down whatever we started ourselves.
            await DisposeAsync();
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

// Same real-app boot as DatabaseFixture, but with App:DemoAccountEnabled
// forced off, so DemoAuthDisabledTests can assert on the disabled path
// without affecting the shared fixture other test classes use.
public class DemoAccountDisabledDatabaseFixture : DatabaseFixture
{
    protected override bool DemoAccountEnabled => false;
}
