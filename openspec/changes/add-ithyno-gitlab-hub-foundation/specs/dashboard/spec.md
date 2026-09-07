## ADDED Requirements

### Requirement: Optional Hub Event Relay
The workstation server SHALL connect to the configured hub event stream, authenticate without exposing the hub credential to the browser, and relay valid hub notifications through the existing dashboard WebSocket.

#### Scenario: Hub is configured and reachable
- **WHEN** the workstation server establishes an authenticated compatible hub connection
- **THEN** GitLab lifecycle notifications arrive at the dashboard through its existing workstation WebSocket

#### Scenario: Hub is not configured
- **WHEN** no hub URL or credential is configured
- **THEN** the workstation server starts and the dashboard behaves exactly as a standalone filesystem-backed dashboard

### Requirement: Hub Connection Recovery and Status
The workstation server SHALL reconnect to a temporarily unavailable hub using bounded backoff, and the dashboard SHALL distinguish hub connectivity from its workstation live-session status.

#### Scenario: Hub connection drops
- **WHEN** the hub event stream disconnects while the workstation server remains healthy
- **THEN** local dashboard updates continue, hub reconnection is attempted with bounded backoff, and the UI reports only the hub link as unavailable

### Requirement: Safe Hub Notification Navigation
The dashboard SHALL display a hub notification only for an allowlisted event shape and SHALL open its target using a validated GitLab URL.

#### Scenario: Notification target is valid
- **WHEN** a relayed event refers to the configured GitLab origin and an allowed project path
- **THEN** the user can open the corresponding Issue or merge request from the notification

#### Scenario: Notification target is outside configured GitLab
- **WHEN** a relayed event contains an external or malformed target URL
- **THEN** the dashboard does not make that target clickable
