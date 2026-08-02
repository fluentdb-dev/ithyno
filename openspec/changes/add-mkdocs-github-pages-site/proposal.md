---
tags: [docs, pages, github, distribution, mkdocs]
execution: worktree
---

## Why

The repository accumulates a substantial `docs/` tree — architecture,
roadmap, migration-guide, user-manual, release, skill-capabilities,
plus dated planning notes and ideas — but the only way to browse it
today is GitHub's file view: no search, no cross-linked nav sidebar,
no permanent per-doc URL that's not a repo-internal path.

A published Docs site fixes that with minimal ongoing cost. MkDocs
Material builds a searchable, sidebar-navigated static site directly
from `docs/*.md` sources; deploying to GitHub Pages requires only a
tiny CI workflow. Users get:
- Full-text search over every doc
- Consistent left-sidebar navigation grouped by topic
- Permanent `https://<org>.github.io/<repo>/…` URLs to share
- Automatic dark/light theme

## What Changes

1. **New `mkdocs.yml`** at repo root: declares site title, theme
   (Material), navigation structure mirroring `docs/`, and any
   markdown-extension plugins needed (mermaid, admonitions).

2. **New `.github/workflows/pages.yml`**: on `push` to `main` (or
   manual dispatch), install MkDocs Material, build the site into
   `site/`, upload as a `github-pages` artifact, deploy via
   `actions/deploy-pages@v4`. Path filter: only run when `docs/**`,
   `mkdocs.yml`, or `README.md` changes.

3. **Home page**: `README.md` becomes the home. MkDocs supports
   sourcing a top-level page from repo root (`docs_dir: docs` +
   `nav: - Home: ../README.md` OR a small `docs/index.md` that
   `!include`s the README).

4. **Nav structure** (initial):
   ```
   Home                 → README.md
   Getting Started      → user-manual-init-and-import.md,
                          user-manual/*
   Architecture         → architecture.md, adr/*
   Development          → roadmap.md, release.md,
                          skill-capabilities.md,
                          skill-e2e-manual-verification.md,
                          migration-guide.md
   Planning notes       → ideas/* (grouped by date)
   ```

5. **No changes to existing docs content**: MkDocs reads
   `docs/**/*.md` in place. No `.md` file gets moved, renamed, or
   rewritten by this change.

## Capabilities

### New Capabilities
- `docs-site`: publish the `docs/` tree as a searchable GitHub Pages
  site with sidebar navigation, sourced automatically on `main`
  push. Home page = repo `README.md`.

### Modified Capabilities
None.

## Impact

- **New files**:
  - `mkdocs.yml` (~30 lines)
  - `.github/workflows/pages.yml` (~40 lines)
  - `docs/index.md` (small shim that references README.md, if needed)
- **No changes** to existing `docs/*.md`, `README.md`, or code.
- **No new npm/pip dependencies** in the repo — MkDocs is installed
  ephemerally by the pages workflow (`pip install mkdocs-material`).
- **Repo admin step** (documented, not automatable): enable Pages
  in Settings → Pages → Source: "GitHub Actions". Without this the
  workflow succeeds but nothing publishes.
- **URL surface**: `https://<org>.github.io/<repo>/` becomes a new
  public entry point for the project. Landing content = README.

## Non-goals for v1

- **Auto-populated Downloads page** — the Downloads page linking to
  latest GitHub Release assets is a follow-up. v1 just publishes
  docs.
- **Custom domain / CNAME** — Pages uses the default
  `<org>.github.io/<repo>/` URL. Custom domain is a maintainer-side
  DNS decision, separate change.
- **PR previews** — deploying a preview site per PR is a nice-to-
  have but not v1 scope. Only `main` triggers a deploy.
- **i18n / multi-lang docs** — English-only for v1.
- **Search index tuning / hooks** — MkDocs Material's default
  search plugin is fine; advanced tuning (Algolia, custom
  indexing) is deferred.

## Design notes

**Why MkDocs Material over Jekyll / Docusaurus / others?**

- **MkDocs Material**: pure-markdown source (matches our docs/
  tree 1:1), zero JS build needed on our side, one YAML config file,
  installed via pip in CI (no repo dep bloat), search included,
  strong nav conventions.
- **Jekyll**: GitHub Pages' default, but its Liquid template syntax
  can conflict with markdown containing braces (we have code
  snippets with `{{...}}` in `.claude` templates). Rejected.
- **Docusaurus / Nextra / VitePress**: React-based, would require an
  npm dependency in the repo (mkdocs pip stays entirely in the CI
  runner). Rejected for footprint.

**Why deploy on `main` push only (not on tag)?**

Docs are living. They update between releases and shouldn't wait
for a version bump to become visible. The publish workflow is
independent of `release.yml` — different trigger, different content,
different deploy target.

**Why path-filter on `docs/**`, `mkdocs.yml`, `README.md`?**

A code-only push (server/, web/, electron/) doesn't change any doc,
so re-building and re-deploying the same site wastes CI minutes.
Filter keeps builds precise.
