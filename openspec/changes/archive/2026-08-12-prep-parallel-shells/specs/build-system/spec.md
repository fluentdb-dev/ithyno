## ADDED Requirements

### Requirement: Server Precompile Script
The system SHALL provide a `build:server` npm script that compiles the
TypeScript sources under `server/` to JavaScript in `server-dist/`, so
packaging paths (Electron, VS Code extension) can ship a runtime that does
not require `tsx`.

#### Scenario: Build the server bundle
- **WHEN** the developer runs `npm run build:server`
- **THEN** the script emits compiled `.js` files under `server-dist/` mirroring the `server/` directory structure

#### Scenario: server-dist matches the runtime
- **WHEN** `server-dist/index.js` is executed with Node
- **THEN** it boots the same Fastify server that `tsx server/index.ts` does, observing the same environment variables and exposing the same endpoints

### Requirement: Pre-staged Workspaces Array
The system SHALL declare `electron/` and `vscode-extension/` as npm
workspaces ahead of those directories existing, so the parallel changes
that create them do not have to modify the root `package.json` workspaces
field on merge.

#### Scenario: Workspaces declared
- **WHEN** a reader inspects the root `package.json`
- **THEN** `workspaces` is `["electron", "vscode-extension"]`

#### Scenario: npm install with missing workspace dirs
- **WHEN** `npm install` runs and neither `electron/` nor `vscode-extension/` exist yet
- **THEN** the install succeeds (npm may warn about the missing entries)

### Requirement: Gitignore Coverage for Shell Builds
The system's `.gitignore` SHALL exclude every shell build artifact
directory (`server-dist/`, `electron/out/`, `electron/dist/`,
`vscode-extension/out/`) so the parallel changes do not race to add them
later.

#### Scenario: Build artifacts ignored
- **WHEN** any of `server-dist/`, `electron/out/`, `electron/dist/`, or `vscode-extension/out/` exists with content
- **THEN** `git status` shows none of those paths as untracked
