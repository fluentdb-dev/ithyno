## 1. Server: Inject Endpoint
- [x] 1.1 Track open /pty sockets and remember the most recently active one
- [x] 1.2 Add `POST /api/pty/inject` writing to the active socket
- [x] 1.3 Reject non-localhost clients with 403
- [x] 1.4 Return 409 with a hint when no terminal is open
- [x] 1.5 Append a newline by default; allow `terminate: false` to opt out

## 2. UI: New Change
- [x] 2.1 Add a "+ New Change" button to Overview
- [x] 2.2 Modal: short description input
- [x] 2.3 Preview the exact `/opsx:propose "<description>"` line before sending
- [x] 2.4 Show toast "Sent to terminal" on 200; show open-terminal hint on 409

## 3. UI: Apply / Archive
- [x] 3.1 Add Apply and Archive buttons to the ChangeDetail header
- [x] 3.2 One-tap confirm dialog showing the literal command
- [x] 3.3 Inject the corresponding `/opsx:apply <id>` or `/opsx:archive <id>`

## 4. Verification
- [x] 4.1 With an open terminal, "+ New Change" creates the change folder via Claude
- [x] 4.2 With no terminal open, the action shows the open-terminal hint
- [x] 4.3 Non-localhost POST to /api/pty/inject is rejected (manual test)
