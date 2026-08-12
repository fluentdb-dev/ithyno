---
name: ithy-opsx-test-probe
description: Test-only skill that proves an Agent can discover and execute an initialized project skill by writing a nonce-bearing JSON artifact.
license: MIT
---

# ithy-opsx test probe

This is a harmless, test-only skill. Run it only when the prompt explicitly
asks for `ithy-opsx-test-probe` and supplies an Agent name, nonce, and artifact
path.

Create the artifact's parent directory and write exactly one JSON object:

```json
{
  "schemaVersion": 1,
  "probe": "ithy-opsx-test-probe",
  "agent": "<Agent name from the prompt>",
  "nonce": "<nonce from the prompt>",
  "status": "recognized"
}
```

Do not modify project source, Git state, OpenSpec artifacts, or any other file.
Do not substitute a guessed value: copy the Agent name, nonce, and artifact
path exactly from the invoking prompt. After writing the JSON, stop.
