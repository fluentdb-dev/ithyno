# Tasks

## 1. MkDocs config

- [ ] 1.1 Create `mkdocs.yml` at repo root with:
      - `site_name: ithyno`
      - `site_url: https://<org>.github.io/<repo>/` (placeholder; maintainer edits post-merge)
      - `repo_url: <repo>` / `repo_name: <org>/<repo>` (chip in top-right)
      - `theme: name: material`, `features: [navigation.tabs, navigation.sections, search.suggest, content.code.copy, toc.integrate]`
      - `palette: [primary: indigo, accent: indigo, scheme: default/slate for light+dark toggle]`
      - `docs_dir: docs`
      - `markdown_extensions: [admonition, pymdownx.details, pymdownx.superfences, tables, toc: permalink]`
      - `plugins: [search]` (leave mermaid to a follow-up if a diagram fails to render)
- [ ] 1.2 Create `docs/index.md` with a short one-liner + `--8<-- "README.md"` include (via `pymdownx.snippets`) OR just a curated home-page markdown that summarizes what ithyno is (avoids README's repo-specific tone). Pick per home-page taste after seeing preview.
- [ ] 1.3 Author the `nav:` block in `mkdocs.yml` mapping the sections outlined in `proposal.md` (Home / Getting Started / Architecture / Development / Planning notes) to their `.md` files. Files not appearing under `nav:` are still built but unlisted — MkDocs Material shows them via search only.

## 2. Deploy workflow

- [ ] 2.1 Create `.github/workflows/pages.yml`:
      - Triggers: `push` to `main` with `paths:` filter (`docs/**`, `mkdocs.yml`, `README.md`, `.github/workflows/pages.yml`), plus `workflow_dispatch`.
      - `permissions: pages: write, id-token: write, contents: read` (least-privilege for `actions/deploy-pages`).
      - `concurrency: group: pages, cancel-in-progress: false` (Pages allows one deploy at a time and completes cleanly; don't cancel a running deploy).
      - Job 1 `build`: checkout, set up Python 3.x, `pip install mkdocs-material`, `mkdocs build --strict`, upload built `site/` as a Pages artifact via `actions/upload-pages-artifact@v3`.
      - Job 2 `deploy`: `needs: build`, uses `actions/deploy-pages@v4`, declares `environment: github-pages`, and outputs the deployed URL to the job summary.
- [ ] 2.2 Verify `--strict` flag — MkDocs fails the build on any broken internal link or missing nav-referenced file. This catches doc-rot at CI time rather than silently deploying broken pages.

## 3. Repo admin (manual, documented)

- [ ] 3.1 Document in `docs/release.md` (or a new short `docs/pages-setup.md`) the one-time Repo settings needed to enable Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Until this is set once, the deploy job succeeds but nothing goes live. This is inherently manual (GitHub UI) — the workflow can't self-enable Pages.

## 4. Verification

- [ ] 4.1 `npm run openspec -- validate add-mkdocs-github-pages-site --strict` — passes.
- [ ] 4.2 Local preview (maintainer): `pip install mkdocs-material && mkdocs serve` → browse `http://localhost:8000/`, verify nav renders, search finds a known phrase from `docs/roadmap.md`, dark/light theme toggle works.
- [ ] 4.3 CI dry-run (maintainer, deferred): merge to `main` → watch `pages.yml` run → confirm `github-pages` environment deploys → confirm site loads at `https://<org>.github.io/<repo>/`.

## 5. Docs

- [ ] 5.1 Write `openspec/changes/add-mkdocs-github-pages-site/outcome.md` capturing: which docs ended up under nav vs search-only, any `--strict` link-check failures that needed fixing, and whether the README-as-home approach vs a curated `docs/index.md` felt better.
