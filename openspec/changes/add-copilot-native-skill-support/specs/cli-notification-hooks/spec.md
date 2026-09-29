## ADDED Requirements

### Requirement: Copilot notification Hook is configurable from Prerequisites
When GitHub Copilot CLI is installed, Settings → Prerequisites SHALL display the same opt-in notification control on the Copilot row as other supported CLIs. The control SHALL use the existing Copilot Hook status and toggle API and SHALL remain independent from OpenSpec and ithyno Skill installation.

#### Scenario: Installed Copilot exposes notification control
- **GIVEN** GitHub Copilot CLI is detected as installed
- **WHEN** the user opens Settings → Prerequisites
- **THEN** the Copilot row displays the notification toggle after the Manage skills control

#### Scenario: Enabling Copilot notification does not reinstall Skills
- **WHEN** the user enables the Copilot notification control
- **THEN** the existing Copilot Hook toggle endpoint installs `.github/hooks/ithyno-notification.json`
- **AND** neither OpenSpec nor ithyno Skill installation is invoked

#### Scenario: Skill installation does not enable Copilot notification
- **WHEN** the user installs OpenSpec or ithyno Skills for Copilot
- **THEN** the Copilot notification Hook state remains unchanged
