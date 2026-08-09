using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using server.AiBulkGeneration;
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

    // Program.cs fails fast at startup if Anthropic:ApiKey is unset (see
    // #196). No AI Bulk Generation behavior calls the real Anthropic API
    // yet, so this placeholder only needs to satisfy the fail-fast check.
    public const string AnthropicApiKey = "test-fixture-anthropic-api-key";

    // Overridden by DemoAccountDisabledDatabaseFixture to exercise the
    // App:DemoAccountEnabled=false path -- that variant boots its own
    // Postgres container, since the flag is only read by Program.cs at
    // WebApplicationFactory build time.
    protected virtual bool DemoAccountEnabled => true;

    // Overridden by SmallDailyLimitDatabaseFixture so #214's rate-limit
    // tests can exhaust the cap in a handful of requests instead of 20.
    protected virtual int DailyLimitPerTeacher => 20;

    // Overridden by SmallMonthlyLimitDatabaseFixture (#215) so its
    // rate-limit tests can exhaust the cap in a handful of requests instead
    // of 100.
    protected virtual int MonthlyLimit => 100;

    // No-op by default; see the ConfigureServices call site above.
    protected virtual void ConfigureTestServices(IServiceCollection services)
    {
    }

    public HttpClient CreateClient() => _factory!.CreateClient();

    // Exposes the running app's DI container so tests can assert directly
    // against the database (e.g. demo-seeded rows) without a dedicated
    // read endpoint for every entity.
    public IServiceProvider Services => _factory!.Services;

    public async Task InitializeAsync()
    {
        // Program.cs reads Anthropic:ApiKey eagerly -- before builder.Build()
        // runs -- exactly like Google:ClientId. But unlike Google:ClientId,
        // there's no appsettings.Development.json placeholder to fall back on
        // (see appsettings.Development.json for why), and the
        // ConfigureAppConfiguration override below is only merged into
        // builder.Configuration once Build() runs (same reason
        // Jwt:SigningKey is read lazily further down in Program.cs), so it
        // isn't visible to that eager read. An environment variable *is*
        // picked up by WebApplication.CreateBuilder's default configuration
        // setup, before any of Program.cs's own code executes, so it's
        // visible in time. Uses the same Anthropic__ApiKey double-underscore
        // name Railway uses in production (see server/README.md).
        Environment.SetEnvironmentVariable("Anthropic__ApiKey", AnthropicApiKey);

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
                        ["Anthropic:ApiKey"] = AnthropicApiKey,
                        ["App:DemoAccountEnabled"] = DemoAccountEnabled ? "true" : "false",
                        ["AiBulkGeneration:DailyLimitPerTeacher"] = DailyLimitPerTeacher.ToString(),
                        ["AiBulkGeneration:MonthlyLimit"] = MonthlyLimit.ToString(),
                    }));

                // The real GoogleTokenVerifier calls out to Google's network;
                // tests exercise the endpoint logic against a stub instead,
                // per #18's testing decisions.
                builder.ConfigureServices(services =>
                    services.Replace(ServiceDescriptor.Scoped<IGoogleTokenVerifier, StubGoogleTokenVerifier>()));

                // AnthropicCurriculumClient is a placeholder that throws --
                // tests substitute a stub instead, per #197's testing
                // decisions (mirrors the Google replacement above).
                builder.ConfigureServices(services =>
                    services.Replace(ServiceDescriptor.Scoped<IAnthropicCurriculumClient, StubAnthropicCurriculumClient>()));

                // Extension point for a subclass needing a different
                // IAnthropicCurriculumClient double (e.g.
                // CancellationProbeDatabaseFixture) or any other
                // test-specific service override -- runs last, after the
                // two replacements above, so it can override them further.
                builder.ConfigureServices(ConfigureTestServices);
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

// Same real-app boot as DatabaseFixture, but with a daily generation cap
// small enough that AiBulkGenerationRateLimitTests can exhaust it in a
// handful of requests instead of 20.
public class SmallDailyLimitDatabaseFixture : DatabaseFixture
{
    protected override int DailyLimitPerTeacher => 3;
}

// Same real-app boot as DatabaseFixture, but with IAnthropicCurriculumClient
// replaced by a singleton probe that blocks until cancelled, so
// AiBulkGenerationCancellationTests (#218) can observe -- from outside the
// request -- whether the endpoint's CancellationToken actually reached the
// generation call when a client disconnects mid-request. Singleton (not
// Scoped, like the other stub) specifically so the test can resolve the
// exact instance a request used via fixture.Services.
public class CancellationProbeDatabaseFixture : DatabaseFixture
{
    protected override void ConfigureTestServices(IServiceCollection services) =>
        services.Replace(ServiceDescriptor.Singleton<IAnthropicCurriculumClient, CancellationProbeAnthropicCurriculumClient>());
}

// Same real-app boot as DatabaseFixture, but with a monthly generation cap
// small enough that AiBulkGenerationMonthlyRateLimitTests (#215) can exhaust
// it in a handful of requests instead of 100.
public class SmallMonthlyLimitDatabaseFixture : DatabaseFixture
{
    protected override int MonthlyLimit => 3;
}

// Same real-app boot as DatabaseFixture, but with both caps small, so
// AiBulkGenerationRateLimitCrossContaminationTests (#215) can exercise both
// limits within the same test run without either one dwarfing the other.
public class SmallDailyAndMonthlyLimitDatabaseFixture : DatabaseFixture
{
    protected override int DailyLimitPerTeacher => 2;
    protected override int MonthlyLimit => 3;
}
