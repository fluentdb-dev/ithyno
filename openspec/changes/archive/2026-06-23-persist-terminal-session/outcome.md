## ✅ What worked
- **Lifting Terminal to App level** turned out to be a tiny patch (a few lines moved) because `terminalVisible` was already in the store. The architectural fix was almost free.
- **`display: none` instead of unmount** preserved scrollback and any in-flight Claude conversation. The whole purpose of the change reduced to one CSS rule plus a JSX move.
- **CSS-only visibility toggle** kept the React tree stable, which side-stepped any unmount/remount churn in xterm.js.

## ⚠️ What surprised us
- The "PTY dies on hide" bug was discovered as a UX complaint, not a test failure. Nothing in the original `add-embedded-terminal` spec said the session must persist — the spec was honest about its scope. The lesson: subtle but important lifecycle properties belong in the original spec, not in retroactive fixes.

## 🔁 What we'd do differently
- Should have specified session persistence in `add-embedded-terminal` from day one. The spec said "embed a terminal" but not "the terminal stays alive across navigation" — and that's a meaningfully different contract.

## 🌱 Follow-ups
- A global Show-Terminal button in the topbar so the user can summon the terminal from Overview without first navigating to a change. The toggle currently only lives on ChangeDetail headers.
- Bottom-docked layout as an alternative to right-docked, controllable via the same `terminalVisible` flag.
