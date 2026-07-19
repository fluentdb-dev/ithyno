# Tasks — clarify-agmsg-dispatch-semantics

## 1. PENDING annotations

- [x] 1.1 `openspec/specs/dashboard/spec.md` の
  `### Requirement: Agent Mode Field` に PENDING MODIFIED annotation
  (English) を SHALL 段落直後に挿入
- [x] 1.2 同 spec の `### Requirement: Dispatch Slash Command` にも
  PENDING MODIFIED を追加

## 2. Verify

- [x] 2.1 `openspec validate clarify-agmsg-dispatch-semantics --strict` VALID
- [x] 2.2 `npm test && npm run typecheck && npm run build` clean
  (spec-only 変更、code 変更なし)

## 3. Post-impl

- [x] 3.1 outcome.md
- [ ] 3.2 `/ithy-opsx:archive clarify-agmsg-dispatch-semantics`
