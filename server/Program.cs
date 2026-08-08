using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using server.Auth;
using server.Data;
using server.Sync;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.AddDbContext<AppDbContext>(options => options
    .UseNpgsql(builder.Configuration.GetConnectionString("Default"))
    .UseSnakeCaseNamingConvention());

// Read eagerly (like Cors:SpaOrigins below) so a missing Google:ClientId
// fails the app at startup instead of GoogleTokenVerifier silently
// skipping audience validation on the first sign-in attempt.
var googleClientId = builder.Configuration["Google:ClientId"];
if (string.IsNullOrEmpty(googleClientId))
{
    throw new InvalidOperationException("Google:ClientId is not configured.");
}

// Read eagerly, same as Google:ClientId above, so a missing Anthropic:ApiKey
// fails the app at startup instead of the Anthropic client silently
// degrading (or throwing mid-request) on the first AI Bulk Generation call.
// Unlike Google:ClientId, a fake value here can't authenticate against the
// real Anthropic API -- appsettings.Development.json intentionally carries
// no placeholder, so local dev requires `dotnet user-secrets set
// Anthropic:ApiKey <key>` (see server/README.md).
var anthropicApiKey = builder.Configuration["Anthropic:ApiKey"];
if (string.IsNullOrEmpty(anthropicApiKey))
{
    throw new InvalidOperationException("Anthropic:ApiKey is not configured.");
}

builder.Services.AddScoped<IGoogleTokenVerifier>(_ => new GoogleTokenVerifier(googleClientId));
builder.Services.AddScoped<ISessionTokenService, JwtSessionTokenService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Without this, the token handler remaps the short "sub" claim to
        // the long ClaimTypes.NameIdentifier URI on the way in, and
        // AuthEndpoints.cs's principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
        // silently finds nothing.
        options.MapInboundClaims = false;

        // Deliberately read here (inside the options callback), not eagerly
        // above like Google:ClientId: this callback runs lazily, once the
        // host's configuration is fully built -- including a test host's
        // ConfigureAppConfiguration overrides (see DatabaseFixture). Reading
        // eagerly here previously validated tokens against the *default*
        // Jwt:SigningKey/Issuer while JwtSessionTokenService (resolved via
        // DI, seeing the fully-built config) signed tokens with the test
        // fixture's override -- a silent mismatch that failed every token.
        var issuer = JwtConfiguration.Issuer(builder.Configuration);
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = issuer,
            ValidateAudience = true,
            ValidAudience = issuer,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = JwtConfiguration.SigningKey(builder.Configuration),
        };
    });
builder.Services.AddAuthorization();

// Comma-separated so the production origin can be set as a single Railway
// env var (Cors__SpaOrigins), the same pattern #10 already uses for the
// Postgres connection string and OAuth credentials. No AllowAnyOrigin: only
// origins listed here are ever allowed, and credentials (session cookies,
// per #5) require an explicit origin list rather than a wildcard anyway.
var spaOrigins = (builder.Configuration["Cors:SpaOrigins"] ?? string.Empty)
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options => options.AddPolicy("SpaOrigin", policy => policy
    .WithOrigins(spaOrigins)
    .WithMethods("GET", "POST")
    .WithHeaders("Content-Type", "Authorization")
    .AllowCredentials()));

var app = builder.Build();

// Migrations auto-apply on startup — no separate migration step in any deploy path.
// Fail-fast is intentional: if migration fails, the container fails to start.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseCors("SpaOrigin");

app.UseAuthentication();
app.UseAuthorization();

app.MapAuthEndpoints();
app.MapSyncEndpoints();

// Confirms the process is up (and, since Migrate() above already ran, that
// migrations succeeded) -- for the docker build+run check and a one-time
// post-deploy manual hit. No auth, no dependency checks: see #15.
app.MapGet("/health", () => Results.Ok());

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast =  Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}

// Exposes the top-level Program as a type WebApplicationFactory<Program> can target,
// so integration tests exercise the real startup path (including db.Database.Migrate()).
public partial class Program;
