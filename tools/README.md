# Tools

This directory is for operator-facing repository helpers that are not part of
the runtime app, the standalone bundle, or the source audits.

## `update-tracking-branches.sh`

Fast-forwards every local branch that has an upstream, then returns to the
branch where the command started.

```bash
tools/update-tracking-branches.sh
```

Contract:

- Refuses to run from a detached `HEAD`.
- Refuses to switch branches when the worktree has uncommitted changes.
- Uses `git fetch --all --prune`, then `git merge --ff-only` for each tracking
  branch.
- Does not create merge commits, rebase branches, delete branches, or mutate
  untracked files.

Use this before final release checks when several local tracking branches need
to be aligned with their upstreams. Use `npm run stabilize`, `npm run perf:ci`,
`npm run toc:audit`, and `npm run qbit:search-audit` for code quality gates;
this script is only git hygiene.
