using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using server.Auth;
using server.Data;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.AddDbContext<AppDbContext>(options => options
    .UseNpgsql(builder.Configuration.GetConnectionString("Default"))
    .UseSnakeCaseNamingConvention());

// Read eagerly (like Cors:SpaOrigins below) rather than inside a request
// path, so missing config fails the app at startup instead of surfacing
// as a 500 -- or, for Google:ClientId, silently skipping audience
// validation -- on the first authenticated request.
var googleClientId = builder.Configuration["Google:ClientId"];
if (string.IsNullOrEmpty(googleClientId))
{
    throw new InvalidOperationException("Google:ClientId is not configured.");
}

var jwtIssuer = JwtConfiguration.Issuer(builder.Configuration);
var jwtSigningKey = JwtConfiguration.SigningKey(builder.Configuration);

builder.Services.AddScoped<IGoogleTokenVerifier>(_ => new GoogleTokenVerifier(googleClientId));
builder.Services.AddScoped<ISessionTokenService, JwtSessionTokenService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtIssuer,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwtSigningKey,
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
