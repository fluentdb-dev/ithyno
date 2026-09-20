## ADDED Requirements

### Requirement: Bundled workflows use the agent bridge
Newly rendered ithyno workflow definitions SHALL use stable `ithyno` CLI bridge commands for supported dashboard control-plane operations instead of constructing authenticated `curl` requests. Source workflows, client-specific renderings, project templates, and packaged copies SHALL remain synchronized.

#### Scenario: Dispatch publishes Manager activity
- **WHEN** a newly installed dispatch workflow reports a Manager activity transition
- **THEN** it invokes the documented ithyno CLI bridge command without reading or interpolating a dashboard session token

#### Scenario: Workflow runs outside the embedded Manager PTY
- **WHEN** a newly installed workflow runs from a process with no `ITHYNO_*` contact variables
- **THEN** its supported control-plane operations resolve the exact project through the CLI bridge

### Requirement: Explicit legacy compatibility path
During the migration window, existing environment-based HTTP workflow integrations MAY remain operational, but newly rendered workflows SHALL NOT guess a default port, scan localhost ports, recover tokens from other processes, or silently switch to another project when the bridge is unavailable.

#### Scenario: Bridge is unavailable
- **WHEN** a newly rendered workflow cannot reach the bridge for its exact project
- **THEN** it reports the bridge error and follows the workflow's escalation contract instead of calling `localhost:4321`

#### Scenario: Older installed workflow remains present
- **WHEN** diagnostics detect an installed workflow version that still uses the explicit environment-based HTTP contract
- **THEN** diagnostics identify it as a compatibility version and offer an update without silently overwriting user customizations
