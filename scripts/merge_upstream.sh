#!/usr/bin/env bash

set -euo pipefail

protected_file="navigation/about.md"
upstream_branch="upstream/main"

if [[ -n "$(git status --porcelain)" ]]; then
    echo "Error: commit or stash your changes before merging upstream."
    exit 1
fi

if ! git remote get-url upstream >/dev/null 2>&1; then
    echo "Error: the upstream remote is not configured."
    echo "Run: git remote add upstream https://github.com/open-coding-society/portfolio.git"
    exit 1
fi

echo "Fetching updates from Open Coding Society..."
git fetch upstream --prune

if git merge-base --is-ancestor "$upstream_branch" HEAD; then
    echo "Already up to date with $upstream_branch."
    exit 0
fi

starting_revision="$(git rev-parse HEAD)"

echo "Merging $upstream_branch while preserving $protected_file..."
if git merge --no-commit --no-ff "$upstream_branch"; then
    git restore --source="$starting_revision" --staged --worktree -- "$protected_file"
    git commit -m "Merge upstream updates"
    echo "Upstream merge complete; $protected_file was preserved."
else
    git restore --source="$starting_revision" --staged --worktree -- "$protected_file"
    echo "The About page was preserved, but other merge conflicts need resolution."
    echo "Resolve them, stage the files, and run: git commit"
    exit 1
fi
