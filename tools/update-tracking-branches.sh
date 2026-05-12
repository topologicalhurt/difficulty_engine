#!/usr/bin/env bash
set -euo pipefail

current_branch="$(git branch --show-current)"
if [[ -z "$current_branch" ]]; then
  echo "Refusing to run from a detached HEAD." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to switch branches with uncommitted changes." >&2
  git status --short >&2
  exit 1
fi

git fetch --all --prune

while read -r branch upstream; do
  [[ -z "$upstream" ]] && continue
  echo "Updating $branch from $upstream"
  git switch --quiet "$branch"
  git merge --ff-only "$upstream"
done < <(git for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads)

git switch --quiet "$current_branch"
echo "All tracking branches are fast-forwarded where possible."
