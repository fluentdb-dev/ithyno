## Outcome

One pure resolver now owns Manager command mapping for propose, dispatch,
apply, archive, merge, and import. Overview, Kanban, Change Detail, Start, and
the server-side Import path all use it, including previews and submit labels.

Codex Managers receive flat native names; Claude, other Managers, and the
no-Manager fallback retain the existing slash commands. A source inventory
found remaining raw slash strings only in static help text, comments, and the
central worker default table—not in product command producers.

Verification completed with focused Codex/non-Codex tests, typecheck, the full
746-test suite, production build, and strict OpenSpec validation.
