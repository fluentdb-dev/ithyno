# Outcome

## ✅ Worked

- Detached workers survive server restarts and are re-adopted from their metadata.
- Agent configuration preserves `detached: true`, and cancellation remains available.
- Focused, full test, typecheck, and build verification passed.

## ⚠️ Surprises

- Public runner events required filtering of internal timer and log-tail state to avoid circular JSON serialization.

## 🔁 Differently

- Detached mode intentionally uses file-backed stdio instead of a PTY and is intended for non-interactive workers.

## 🌱 Follow-ups

- PTY-preserving persistence remains a separate change.
