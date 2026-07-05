#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Clean up agent worktrees, branches, and any lingering `claude` processes
# tied to those worktrees.
#
# The dashboard's runner does not tidy up on its own — an idle agent that
# didn't converge, a server restart mid-run, or the "PTY runs but Claude
# won't act" case all leave the worktree in place. This script is the
# escape hatch.
#
# Usage:
#   ./bin/clean-worktrees.sh          # kill + remove
#   ./bin/clean-worktrees.sh --dry    # show what would be removed
#
# Server memory (the runner's job map) is not touched. Restart the dev
# server if you want a fully fresh state.
set -euo pipefail

DRY=false
if [ "${1:-}" = "--dry" ] || [ "${1:-}" = "-n" ]; then
  DRY=true
fi

# Move to the repo root regardless of where the script is invoked from.
cd "$(dirname "$0")/.."

if [ ! -d .worktrees ] || [ -z "$(ls -A .worktrees 2>/dev/null)" ]; then
  echo "No worktrees under .worktrees/ — nothing to do."
  exit 0
fi

echo "=== worktrees to process ==="
git worktree list | grep -F ".worktrees/" || true
echo

# 1. Kill any live `claude` processes whose cwd sits inside one of the
#    worktrees. This is the equivalent of the runner's own SIGTERM path,
#    just applied from outside so it works even if the runner has forgotten
#    about the job (server restart, memory wipe).
echo "=== killing agent processes tied to worktrees ==="
for wt in .worktrees/*/; do
  [ -d "$wt" ] || continue
  wt_abs=$(cd "$wt" && pwd)
  for pid in $(pgrep -f "^claude$" 2>/dev/null || true); do
    proc_cwd=$(lsof -p "$pid" 2>/dev/null | awk '/cwd/{print $NF}' | head -1)
    if [ "$proc_cwd" = "$wt_abs" ]; then
      if $DRY; then
        echo "  would kill $pid (cwd=$wt_abs)"
      else
        echo "  killing $pid (cwd=$wt_abs)"
        kill -TERM "$pid" 2>/dev/null || true
      fi
    fi
  done
done

if ! $DRY; then
  # Small grace period so the processes release file handles before we
  # yank the worktree out from under them.
  sleep 2
fi
echo

# 2. Remove each worktree + its agent branch.
echo "=== removing worktrees + agent branches ==="
for wt in .worktrees/*/; do
  [ -d "$wt" ] || continue
  id=$(basename "$wt")
  if $DRY; then
    echo "  would remove .worktrees/$id + branch agent/$id"
  else
    git worktree remove --force ".worktrees/$id" 2>&1 || echo "  (worktree remove failed for $id — trying rm -rf)"
    [ -d ".worktrees/$id" ] && rm -rf ".worktrees/$id"
    git branch -D "agent/$id" 2>/dev/null || echo "  (branch agent/$id not present)"
  fi
done
echo

if $DRY; then
  echo "dry run — no changes made."
  exit 0
fi

echo "=== final state ==="
git worktree list
echo
echo "done. If the server is running, its runner memory still holds the"
echo "cancelled/crashed job entries. Restart dev:test to clear them."
