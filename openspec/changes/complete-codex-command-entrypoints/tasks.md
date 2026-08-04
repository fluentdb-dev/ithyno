## 1. Shared resolution

- [ ] 1.1 Generalize the existing Manager dispatch resolver into a pure
  namespace/operation resolver with Codex and non-Codex mappings.
- [ ] 1.2 Add unit tests for `propose`, `dispatch`, `apply`, `archive`,
  `merge`, and `import`, including the no-Manager fallback.

## 2. Dashboard entry points

- [ ] 2.1 Route Overview's **Propose a new change** dialog through the
  resolver and preserve quoted description arguments.
- [ ] 2.2 Route Kanban and Change Detail Apply/Archive/Merge dialogs through
  the resolver without changing CLI-mode commands.
- [ ] 2.3 Migrate the existing Start flow to the same resolver and remove any
  duplicate command mapping.
- [ ] 2.4 Update command previews and submit labels to use the resulting
  command names.

## 3. Server entry point

- [ ] 3.1 Resolve the active Manager in Import generation and inject the
  Manager-native Import command.
- [ ] 3.2 Add Codex and non-Codex Import injection tests.

## 4. Regression coverage

- [ ] 4.1 Add focused tests covering each interactive action for Codex and
  Claude/non-Codex Managers.
- [ ] 4.2 Run a source inventory to ensure no product command producer embeds
  a raw `/opsx:` or `/ithy-opsx:` string outside the resolver or intentional
  static documentation.
- [ ] 4.3 Run `npm run typecheck && npm test && npm run build`.
- [ ] 4.4 Run `npm run openspec -- validate complete-codex-command-entrypoints --strict`.
- [ ] 4.5 Write `outcome.md` before archive.
