# Purpose

Automate session re-authorization and WebSocket reconnection upon system wake-up / focus events.

## MODIFIED Requirements

### Requirement: Session Expired Recovery

The dashboard SHALL surface authentication failures as a single full-page banner with a clear path back to a working session. Upon system wake-up or focus restoration (`visibilitychange` / `focus`), the dashboard SHALL automatically attempt session re-authorization (`checkAuth()`) and WebSocket reconnection before showing the fallback banner.

#### Scenario: System wake-up auto-recovery

- **WHEN** the browser window recovers from sleep or gains focus (`visibilitychange` to visible or `focus`)
- **THEN** the dashboard automatically runs `checkAuth()` and reconnects WebSocket connections
- **AND** if auth check succeeds, the workspace state is reloaded without user intervention

#### Scenario: Electron auto-reload on wake-up auth failure

- **GIVEN** the dashboard is running inside an Electron shell
- **WHEN** system wake-up occurs and auth check initially fails
- **THEN** the shell automatically attempts a single window reload to re-evaluate the local server session before showing the fallback banner
