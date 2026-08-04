# Multi-stage build: SDK image restores/publishes, aspnet runtime image runs
# the published output. This is the same image Railway builds and deploys
# from (per #8's containerization rationale) and the one server/docker-compose.yml
# runs locally against Postgres for the #15 build+run smoke test.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY server.csproj .
RUN dotnet restore server.csproj

COPY . .
RUN dotnet publish server.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Railway injects PORT at runtime; ASPNETCORE_HTTP_PORTS is what ASP.NET
# Core actually binds to. Default it for local `docker run` without PORT set.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

CMD ASPNETCORE_HTTP_PORTS=${PORT:-$ASPNETCORE_HTTP_PORTS} exec dotnet server.dll
