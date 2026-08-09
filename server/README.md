# server

ASP.NET Core API for prokope. See the repo root for frontend (SPA) docs and `CONTEXT.md` for domain terminology.

## Secrets

Config keys that hold real credentials (`Jwt:SigningKey`, `Google:ClientId`, `Anthropic:ApiKey`, ...) are committed to `appsettings.json` as empty placeholders -- safe to commit, but the app fails fast at startup (`InvalidOperationException`, see `Program.cs`) if one is still empty when a code path needs it. Real values are supplied two ways, depending on environment:

### Local development: `dotnet user-secrets`

`Anthropic:ApiKey` is the first secret in this repo that needs a **real, working** value to do anything useful locally -- unlike `Jwt:SigningKey` or `Google:ClientId`, a placeholder string can't authenticate against the actual Anthropic API. `appsettings.Development.json` deliberately does not carry a placeholder for it, so the app will refuse to boot in Development until you supply a real key via [.NET user-secrets](https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets):

```sh
cd server

# One-time only: server.csproj already has a UserSecretsId, so this step
# is done for this repo. If it's ever missing, `dotnet user-secrets set`
# below will fail until you run:
dotnet user-secrets init

# Every developer runs this once, with their own key:
dotnet user-secrets set Anthropic:ApiKey <your-anthropic-api-key>
```

User secrets are stored outside the repo (in your user profile, keyed by the `UserSecretsId` in `server.csproj`), are picked up automatically by `dotnet run` / `dotnet watch` in the Development environment, and are never committed.

### Production: Railway environment variables

Railway supplies real secrets as environment variables using ASP.NET Core's double-underscore convention for nested config keys -- `Section:Key` becomes `Section__Key`. This repo already follows that convention for `Jwt:SigningKey` (`Jwt__SigningKey`) and `Cors:SpaOrigins` (`Cors__SpaOrigins`). `Anthropic:ApiKey` follows the same pattern:

```
Anthropic__ApiKey=<real key, set in Railway's dashboard, never committed>
```

No code or Docker/Compose changes are needed to support this -- ASP.NET Core's configuration system maps `Anthropic__ApiKey` onto `Anthropic:ApiKey` automatically at startup.

## Model configuration

`Anthropic:Model` (default `claude-sonnet-5` in `appsettings.json`) is not a secret and is safe to commit -- it selects which Claude model the server calls, not a credential.
