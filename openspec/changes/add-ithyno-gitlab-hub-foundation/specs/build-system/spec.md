## ADDED Requirements

### Requirement: Hub and Shared Workspaces
The repository SHALL define `hub/` and `shared/` as npm workspaces with explicit package boundaries, dependency declarations, typecheck, test, and build scripts.

#### Scenario: Install the monorepo
- **WHEN** a developer performs the supported root dependency installation
- **THEN** the hub, shared package, and existing workstation packages resolve a single compatible shared API

### Requirement: Independently Buildable Hub Image
The build system SHALL produce a headless hub container image without packaging Electron, VS Code extension assets, workstation PTY binaries, agent CLIs, or development secrets.

#### Scenario: Build the hub container
- **WHEN** the hub image build runs from a clean checkout
- **THEN** it contains the compiled hub and required shared runtime files and starts without building or launching workstation channels

### Requirement: Repository Extraction Guard
The build system SHALL provide compatibility tests for the shared parser and event protocol so a future hub repository extraction can detect incompatible producer/consumer versions.

#### Scenario: Protocol or parser shape drifts
- **WHEN** the hub and workstation are built against incompatible shared contracts
- **THEN** compatibility verification fails before publishing a hub image or workstation release
