# Research: AI provider/mechanism for AI Bulk Generation's web search + structured output

**Wayfinder context:** map issue [#157](https://github.com/ADCogburn/prokope/issues/157), open question [#158](https://github.com/ADCogburn/prokope/issues/158). This document is the research artifact for #158; it does not resolve or close that issue.

**Feature being scoped (issue [#144](https://github.com/ADCogburn/prokope/issues/144)):** a teacher types a curriculum name (e.g. "Saxon Math 5/4"); the system searches the web for that curriculum's public table of contents / scope-and-sequence, then returns a structured list of lesson objects (`unit: int`, `lesson_in_unit: int`, `title: string`, `description: string`, variable lesson count per unit) for teacher review.

---

## Recommendation

**Use Anthropic's Claude API** (Claude Sonnet 5, `claude-sonnet-5`) called via the **official `Anthropic` .NET SDK** (NuGet package `Anthropic`), using the server-side `web_search` tool.

**Call shape: two calls, not one** — even though Anthropic's API technically supports combining `web_search` and structured output (`output_config.format`) in a single request:

1. **Call 1 — search + gather.** Send the curriculum name with the `web_search_20260318` tool (no `output_config.format`). Let Claude search, read, and produce a free-text (or loosely-structured) summary of every unit and lesson it found, with citations.
2. **Call 2 — extract + constrain.** Feed Call 1's output text back in as context and issue a *plain* Messages request (no web search tool) with `output_config: {format: {type: "json_schema", schema: <lesson-list schema>}}`, asking Claude to convert the notes into the final `unit`/`lesson_in_unit`/`title`/`description` array.

### Why two calls despite one-call support existing

- **Anthropic's docs explicitly state `output_config.format` and tool use (including server tools) are "independent and complementary"** and can be set on the same request — so a single-call design is not blocked by the API. See [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) and [Web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool).
- However, a full curriculum (e.g. 12 units × 15 lessons ≈ 180 lesson objects) is a **large, single JSON payload**. If generation hits `max_tokens` mid-array, the result is **invalid, unparseable JSON** — there's no partial-credit the way there is with free text. Splitting the "did we find the right content" problem (Call 1, prose, degrades gracefully if truncated, cheap to re-run without repeating paid web searches) from the "shape it correctly" problem (Call 2, pure extraction, no tool-use/agentic-loop variability, predictable token budget) makes both failure modes independently retryable and debuggable, and the extraction call becomes deterministic and cheap to retry on schema failure without re-paying for web searches.
- OpenAI's equivalent combination (`web_search` + `text.format` json_schema in the Responses API) is **technically also possible** — both are independent top-level request parameters — but the combination is **not documented as a supported pairing**, and developer-community reports describe structured-output JSON getting cut off / ending in invalid EOF specifically when combined with the web-search tool on longer outputs (see OpenAI findings below). That reinforces the two-call design as the safer default on *either* provider, and tips the provider choice toward Anthropic given equivalent cost and a cleaner, explicitly-documented API contract.

### Why Anthropic over OpenAI

| | Anthropic (Claude) | OpenAI |
|---|---|---|
| Web search tool | `web_search_20260318` — server-side, explicit `max_uses`, domain allow/block lists, `user_location`, per-source citations (`web_search_result_location`), documented `pause_turn` continuation semantics | `web_search` (Responses API) — server-side, `search_context_size`, domain filters, inline citations |
| Structured output + web search in one call | **Documented as supported and complementary** | Technically possible (independent params) but **undocumented as a combo**; community reports of truncated/invalid JSON when combined with web search on larger outputs |
| Official .NET SDK | `Anthropic` NuGet package — this *is* the official SDK (successor to the earlier community `Anthropic.SDK` package), actively versioned (12.x as of this research) | `OpenAI` NuGet package (`openai/openai-dotnet`) — official, Microsoft co-maintained, includes `ResponsesClient`, `ResponseTool.CreateWebSearchTool()`, JSON-schema structured outputs |
| Web search pricing | $10 / 1,000 searches + standard token cost for retrieved content | $10 / 1,000 calls + search content tokens billed at model rates (standard tier); $25/1,000 + free content tokens on the older preview tier for non-reasoning models |

Both providers are viable from a pure capability standpoint and both ship first-party .NET SDKs, so this came down to (a) Anthropic's structured-output-plus-tool-use combination being explicitly documented with no caveats, versus OpenAI's being unaddressed in the guides and flagged by users as unreliable at larger output sizes — exactly the failure mode this feature is most exposed to — and (b) near-identical cost. If a second opinion is wanted before implementation, prototype the two-call flow against both providers with a real large curriculum (e.g. a 15-unit, 12-lessons-per-unit course) and compare schema-validation failure rates before committing.

---

## Detailed findings

### 1. Anthropic Claude API — web search tool

- **Tool versions:** `web_search_20250305` (basic), `web_search_20260209` (adds *dynamic filtering* — Claude writes/runs code server-side to filter results before they hit context, on Claude 4.6+ models), `web_search_20260318` (adds `response_inclusion` control). Declare with `{"type": "web_search_20260318", "name": "web_search"}` in the `tools` array — no beta header required. [Web search tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)
- **Mechanics:** Claude decides when to search; the API runs the search server-side and returns results as a `web_search_tool_result` content block (each item has `url`, `title`, `page_age`, `encrypted_content`); this can repeat multiple times in one turn. Claude's final text response includes inline citations (`web_search_result_location` blocks with `url`, `title`, `cited_text`, `encrypted_index`). Citation fields (`cited_text`, `title`, `url`) don't count toward token usage. [Same source]
- **Continuing a long search turn:** if the server-side loop runs long, the response can come back with `stop_reason: "pause_turn"` — you resend the paused assistant message unchanged to continue; no manual "Continue" prompt needed. [Same source, § pause_turn stop reason]
- **Optional config:** `max_uses` (cap search count — errors as `max_uses_exceeded` inside the result block, not an HTTP error), `allowed_domains`/`blocked_domains` (mutually exclusive), `user_location` for localized results. [Same source]
- **Combining with structured output:** the Structured Outputs guide states plainly: *"Structured outputs and tool use are independent and complementary... They work together in the same request,"* and shows an example request with both `output_config.format` and a `tools` array set simultaneously. No incompatibility with server-side tools (like `web_search`) is documented. [Structured Outputs docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- **What `output_config.format` actually constrains:** only Claude's final text-block response — not tool-call parameters (that's `strict: true` on a tool definition, a separate mechanism). It uses constrained sampling against a compiled JSON-schema grammar; the first request with a new schema has extra latency while the grammar compiles, cached ~24h thereafter. Schema support excludes recursive schemas, external `$ref`, and numeric/string length constraints; requires `additionalProperties: false`. [Same source]
- **.NET/C# SDK:** official NuGet package is simply **`Anthropic`** (`dotnet add package Anthropic`) — this supersedes the earlier community package that was named `Anthropic.SDK`. Actively maintained, versioned into the 12.x range at time of writing. Confirmed via [NuGet Gallery](https://www.nuget.org/packages/Anthropic) and the SDK's own C# examples embedded in the [web search tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) (`Tools = [new ToolUnion(new WebSearchTool20260318())]`).

### 2. OpenAI API — web search + structured outputs

- **Where it lives:** the `web_search` tool is a Responses-API-first feature. *"For new Responses API integrations, use `{ "type": "web_search" }`. The earlier `web_search_preview` tool remains available for legacy integrations."* It's also present in a more limited form via specialized Chat Completions search models (`gpt-5-search-api`) and the Assistants API. [OpenAI web search guide](https://developers.openai.com/api/docs/guides/tools-web-search)
- **Mechanics:** declared as `tools: [{ type: "web_search" }]`, with config for `search_context_size`, domain `filters`, `search_content_types`. The response contains a web-search-call item (search/open_page/find_in_page actions) plus a message item with inline citations/URL annotations. [Same source]
- **Structured outputs:** `text: { format: { type: "json_schema", strict: true, schema: {...} } }` on the Responses API request (this replaces the deprecated top-level `response_format` key from the older Chat Completions convention). Guaranteed schema adherence in strict mode; first request per schema has extra compile latency, then cached. [OpenAI structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- **Combining the two in one call:** **not explicitly documented either way.** `tools` and `text.format` are independent top-level parameters on the same `POST /v1/responses` request object, so nothing in the request schema itself blocks setting both — but the guides never show a worked example doing so, and the guidance explicitly frames `tools`/function-calling and `text.format` as two separate use cases ("If you are connecting the model to tools... use function calling. If you want to structure the model's output... use structured `text.format`") without addressing simultaneous use.
- **Real-world reliability signal:** OpenAI developer-community reports describe exactly the failure mode this feature would be exposed to — combining a hosted `WebSearchTool` with structured outputs on longer/complex schemas produces JSON that is cut off mid-generation, ending in an unexpected EOF around ~6,000 characters, breaking schema validation entirely. One thread is titled *"Agent using WebSearchTool with structured outputs results in validation error with JSON unexpectedly ending with EOF around 6000 characters."* This is not from an official doc — it's forum evidence, cited here as a practical reliability signal rather than a documented API guarantee, but it is directly relevant since a full curriculum's lesson list is very plausibly >6,000 characters of JSON. [OpenAI Developer Community thread](https://community.openai.com/t/agent-using-websearchtool-with-structured-outputs-results-in-validation-error-with-json-unexpectedly-ending-with-eof-around-6000-characters/1143758)
- **.NET/C# SDK:** official package is **`OpenAI`** (`dotnet add package OpenAI`, repo `openai/openai-dotnet`), co-maintained with Microsoft. Confirmed to expose a Responses-API client (`ResponsesClient`) with `ResponseTool.CreateWebSearchTool()` and JSON-schema structured-output helpers in its README/examples. [GitHub — openai/openai-dotnet](https://github.com/openai/openai-dotnet), [NuGet Gallery — OpenAI](https://www.nuget.org/packages/OpenAI)

### 3. Server integration note (this repo)

`server/Program.cs` registers endpoints via `app.MapXEndpoints()` extension methods (pattern in `server/Auth/AuthEndpoints.cs`). Either official SDK (`Anthropic` or `OpenAI` NuGet packages) is a plain injectable HTTP client usable from a new `AiBulkGenerationEndpoints.cs` following that same pattern — no need to fall back to raw `HttpClient` + JSON, since both providers ship maintained, official, non-experimental .NET SDKs.

### 4. Rough cost shape (order of magnitude)

Estimate for one curriculum-generation request (~12 units × ~15 lessons ≈ 180 lesson objects, each `unit`/`lesson_in_unit`/`title`/`description`; ballpark 60–100 output tokens/lesson once JSON overhead is included → ~15–18K output tokens; a handful of web searches returning maybe 15–20K tokens of input content):

| Provider / model | Web search | Input tokens (~20K) | Output tokens (~15K) | Rough total |
|---|---|---|---|---|
| Claude Sonnet 5 (intro pricing thru 2026-08-31: $2/$10 per MTok) | 3–5 searches × $10/1,000 ≈ $0.03–0.05 | ~$0.04 | ~$0.15 | **≈ $0.22–0.24** |
| Claude Sonnet 5 (sticker pricing: $3/$15 per MTok) | ≈ $0.03–0.05 | ~$0.06 | ~$0.23 | **≈ $0.32–0.34** |
| Claude Opus 5 ($5/$25 per MTok) | ≈ $0.03–0.05 | ~$0.10 | ~$0.38 | **≈ $0.51–0.53** |
| OpenAI GPT-5 ($1.25/$10 per MTok) | 3–5 calls × $10/1,000 ≈ $0.03–0.05 | ~$0.025 | ~$0.15 | **≈ $0.21–0.23** |

Sources: [Claude pricing](https://platform.claude.com/docs/en/pricing) (also cached in this environment's `claude-api` skill, pulled 2026-06-24), [Anthropic web search tool pricing](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) ("$10 per 1,000 searches, plus standard token costs for search-generated content"), [OpenAI pricing](https://developers.openai.com/api/docs/pricing) ("$10.00 / 1k calls + Search content tokens billed at model rates" for standard web search; GPT-5 at $1.25/$10.00 per 1M tokens).

Order of magnitude either way: **a few tenths of a cent to roughly half a cent per teacher-initiated generation** — negligible for a feature invoked occasionally per curriculum setup, not per lesson or per page view. The two-call design roughly doubles the fixed per-request overhead of a single fixed-price small system-prompt call but does not meaningfully change the token-cost total, since the same content (search results in, lesson JSON out) is paid for either way — the second call's input is largely the first call's own output being fed back in, which is small relative to the total.

---

## Sources

- Anthropic — Web search tool: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool>
- Anthropic — Structured Outputs: <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>
- Anthropic — Pricing: <https://platform.claude.com/docs/en/pricing>
- Anthropic — official `Anthropic` NuGet package: <https://www.nuget.org/packages/Anthropic>
- OpenAI — Web search tool guide: <https://developers.openai.com/api/docs/guides/tools-web-search>
- OpenAI — Structured outputs guide: <https://developers.openai.com/api/docs/guides/structured-outputs>
- OpenAI — Pricing: <https://developers.openai.com/api/docs/pricing>
- OpenAI — official `openai-dotnet` SDK: <https://github.com/openai/openai-dotnet>, <https://www.nuget.org/packages/OpenAI>
- OpenAI Developer Community — web search + structured outputs truncation report: <https://community.openai.com/t/agent-using-websearchtool-with-structured-outputs-results-in-validation-error-with-json-unexpectedly-ending-with-eof-around-6000-characters/1143758> (community forum, not an official doc — cited as a practical reliability signal only)

---

*Research artifact for GitHub issue [#158](https://github.com/ADCogburn/prokope/issues/158). Does not resolve or close that issue — formal resolution happens in a separate future session.*
