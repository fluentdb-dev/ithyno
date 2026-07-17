# Tasks — add-dummy-tab

## 1. Page component

- [ ] 1.1 Create `web/src/pages/Playground.tsx` exporting a `Playground` function component that renders:
  - `<h1>Playground</h1>`
  - `<p>Dummy tab used to verify multi-agent dispatch. See <code>openspec/changes/add-dummy-tab/</code>.</p>`

## 2. Wire nav + route

- [ ] 2.1 In `web/src/App.tsx`, import `Playground` from `./pages/Playground`.
- [ ] 2.2 Add `<NavLink to="/playground">Playground</NavLink>` inside the `<nav>` in the top bar (after the Docs link).
- [ ] 2.3 Add `<Route path="/playground" element={<Playground />} />` inside the existing `<Routes>` block.

## 3. Verify

- [ ] 3.1 `npm run typecheck` passes.
- [ ] 3.2 `npm test` passes.
- [ ] 3.3 `npm run build` passes.
- [ ] 3.4 Manual: dev server で `/playground` に遷移すると見出しと説明段落が表示され、既存タブは無変更で動作する。
