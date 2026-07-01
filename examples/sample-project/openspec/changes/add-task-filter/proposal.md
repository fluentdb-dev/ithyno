# Proposal: Add Task Filter

## Intent
Long tasks.md files are hard to scan. Let users hide completed tasks so they
can focus on remaining work.

## Scope
In scope: a "show incomplete only" filter on the change detail Tasks tab.
Out of scope: full-text search, tag-based filtering.

## Approach
Client-side filter over the parsed task list — no server changes needed.
