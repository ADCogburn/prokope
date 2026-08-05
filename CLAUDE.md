## Agent skills

### Issue tracker

Issues, specs, and PRs live in GitHub (ADCogburn/prokope), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical role names, used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Teach skill

`.andrew-docs/` is the teach skill's workspace root — Andrew's personal learning materials, not project documentation. It is gitignored: never `git add`, commit, or push it or anything under it, and don't treat its contents as project docs or specs. No other skill or task should write there.

Each distinct mission gets its own subfolder: `.andrew-docs/<mission-slug>/` (MISSION.md, RESOURCES.md, lessons/, reference/, learning-records/, etc.). A `/teach` topic that extends an existing mission (check its `MISSION.md`) goes into that mission's folder as the next lesson, not a new one. `.andrew-docs/INDEX.md` maps all missions — read it first, and update it at the end of every `/teach` session. Default to `.andrew-docs/`, never the repo root — check this file's live contents before writing, since a session's snapshot of it can be stale.

## Branching

This repo stays a single monorepo (SPA at root, API under `/server`). All work happens on a branch cut directly off `master`, no `git worktree` isolation:

```
git checkout master && git pull
git checkout -b <branch-name>
```

Open a PR back to `master` when the branch is ready; see [Issue tracker](#issue-tracker) above.
