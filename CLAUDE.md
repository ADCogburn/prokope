## Agent skills

### Issue tracker

Issues, specs, and PRs live in GitHub (ADCogburn/prokope), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical role names, used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Branching

This repo stays a single monorepo (SPA at root, API under `/server`). All work happens on a branch cut directly off `master`, no `git worktree` isolation:

```
git checkout master && git pull
git checkout -b <branch-name>
```

Open a PR back to `master` when the branch is ready; see [Issue tracker](#issue-tracker) above.
