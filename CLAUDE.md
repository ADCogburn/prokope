## Agent skills

### Issue tracker

Issues, specs, and PRs live in GitHub (ADCogburn/prokope), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Multi-agent worktrees

This repo stays a single monorepo (SPA at root, API under `/server`) even when multiple Claude Code agents work on it concurrently — isolation comes from `git worktree`, not from splitting repos.

Each concurrent agent/terminal works in its own worktree on its own branch, checked out alongside the main clone (e.g. `../prokope.worktrees/<branch-name>`), rather than sharing the main working directory:

```
git worktree add ../prokope.worktrees/<branch-name> -b <branch-name>
```

No repo/tooling change is needed beyond this convention — `git worktree add` is plain git, and the Agent tool's `isolation: "worktree"` option already spawns agents this way.
