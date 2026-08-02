## ADDED Requirements

### Requirement: MkDocs Material site published to GitHub Pages

The repository SHALL publish a searchable static documentation site sourced from the `docs/` tree via MkDocs Material, hosted on GitHub Pages. The site's sole content sources SHALL be the repo's committed markdown (`docs/**/*.md` and `README.md`) plus a top-level `mkdocs.yml` config — no per-page templates, code-generated content, or repo-external fetches. Rebuilds SHALL be automatic on any `main` push that touches doc content; PR pushes and non-doc `main` pushes SHALL be skipped.

#### Scenario: site sourced from docs/ tree only

- **GIVEN** the repository contains `docs/**/*.md` and `README.md`
- **WHEN** the MkDocs build runs
- **THEN** every page on the deployed site traces back to a committed markdown file under `docs/` or the repo root
- **AND** no page content is fetched from an external URL, generated at build time from code, or templated from a source outside the `docs/` and `README.md` set

#### Scenario: workflow deploys on doc-content main push

- **GIVEN** a push to `main` that modifies any of: `docs/**`, `mkdocs.yml`, `README.md`, or `.github/workflows/pages.yml` itself
- **WHEN** the `pages.yml` workflow runs
- **THEN** a `build` job installs MkDocs Material (`pip install mkdocs-material`), runs `mkdocs build --strict`, and uploads the resulting `site/` as a `github-pages` artifact via `actions/upload-pages-artifact@v3`
- **AND** a `deploy` job with `needs: build` publishes the artifact via `actions/deploy-pages@v4` under `environment: github-pages`
- **AND** the deploy job's summary lists the resulting URL
- **AND** the site is reachable at `https://<org>.github.io/<repo>/` (after the one-time Pages-Source enablement in repo Settings)

#### Scenario: workflow skips code-only main push

- **GIVEN** a push to `main` that changes only files outside the doc-content set (e.g., `server/**` or `web/**` with no doc touch)
- **WHEN** GitHub evaluates the `pages.yml` trigger
- **THEN** the workflow does NOT run (the `paths:` filter under `on.push` excludes the changed files)
- **AND** the previously-deployed Pages site remains live, byte-identical

#### Scenario: workflow does not fire on PRs

- **GIVEN** a `pull_request` event
- **WHEN** GitHub evaluates the `pages.yml` trigger
- **THEN** the workflow does NOT run (no `pull_request` trigger declared)
- **AND** PR authors get no false-positive "Pages deploy failed" signal on their PR checks

#### Scenario: broken nav / broken link fails the build

- **GIVEN** `mkdocs.yml`'s `nav:` block references a markdown file that does not exist under `docs/`, OR any `docs/**/*.md` file contains a broken internal `[link](broken.md)`
- **WHEN** `mkdocs build --strict` runs
- **THEN** the build exits non-zero with a message identifying the offending link / path
- **AND** the `deploy` job does not run
- **AND** the previously-deployed site remains live, byte-identical

#### Scenario: no personal / signing / marketplace secrets referenced

- **WHEN** a reviewer inspects `.github/workflows/pages.yml`
- **THEN** the file does NOT reference any repository secret other than the ambient `GITHUB_TOKEN` required by `actions/deploy-pages@v4`
- **AND** the workflow permissions are scoped narrowly: `pages: write`, `id-token: write`, `contents: read` — nothing wider
- **AND** the workflow does NOT invoke any publish command against a package registry, marketplace, or third-party CDN

#### Scenario: single-writer concurrency (Pages allows one deploy at a time)

- **GIVEN** a rapid burst of two `main` doc pushes N seconds apart, both matching the path filter
- **WHEN** the two `pages.yml` runs schedule
- **THEN** the workflow's `concurrency: group: pages, cancel-in-progress: false` ensures the second run queues behind the first rather than cancelling it
- **AND** both deploys eventually complete in push-order, with the later one becoming the live site

#### Scenario: README-as-home OR curated home page

- **GIVEN** `mkdocs.yml` maps its home page to either the repo `README.md` or a curated `docs/index.md`
- **WHEN** the site builds
- **THEN** browsing the site root serves one of those two pages, not a 404 or MkDocs' generic default
- **AND** the choice between README and curated home is a maintainer preference, not a spec constraint — either is compliant

### Requirement: MkDocs config as single source of truth for site structure

The repository SHALL treat `mkdocs.yml` as the single, human-editable source of truth for the published site's navigation, theme, and enabled markdown extensions. Runtime code (server, web, electron) SHALL NOT reference `mkdocs.yml` or the built `site/` directory. Contributors changing site structure SHALL edit only `mkdocs.yml` — no generator scripts, no derived index files.

#### Scenario: no code path depends on the site build

- **WHEN** a reviewer greps the runtime source trees (`server/`, `web/`, `electron/`, `bin/`, `scripts/`)
- **THEN** no source file imports `mkdocs.yml`, references the built `site/` directory, or shells out to `mkdocs`
- **AND** `mkdocs.yml` and `site/` (if a maintainer previews locally) exist entirely for the Pages publish path

#### Scenario: contributor changes site nav via one file

- **GIVEN** a contributor wants to add a new section to the site sidebar
- **WHEN** they edit `mkdocs.yml`'s `nav:` block to include the new file
- **THEN** the next `main` push (that touches `mkdocs.yml`) rebuilds and redeploys with the new section visible
- **AND** no other file requires a corresponding edit
