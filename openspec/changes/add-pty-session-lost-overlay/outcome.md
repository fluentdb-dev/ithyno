## Outcome

The embedded terminal now distinguishes a recoverable transport interruption
from an irrecoverable terminal session. Transient disconnects retry and
reattach without showing a blocking overlay. A bounded failed reconnect, PTY
exit, or missing server-side session presents an explicit recovery action.

The recovery UI separates retrying the existing session from deliberately
starting a new terminal, while normal component cleanup remains silent. Tests
cover reconnect deadlines, repeated retries, deliberate restarts, and cleanup,
and the recovered-terminal flow was verified in Electron.
