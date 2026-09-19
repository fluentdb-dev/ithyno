## 1. Context contract

- [ ] Define runtime context values and optional platform app identifiers.
- [ ] Detect Electron and VS Code contexts in the web shell.
- [ ] Pass context through the hook toggle API and installers.

## 2. Notification providers

- [ ] Update sh and PowerShell templates to consume context and avoid fixed apps.
- [ ] Preserve project-aware group and provider-specific timeout behavior.
- [ ] Support safe no-op click behavior for direct CLI and unsupported hosts.

## 3. Compatibility and verification

- [ ] Match legacy hook entries for status/removal and migrate on re-enable.
- [ ] Add API, installer, script, and runtime-context tests.
- [ ] Update pages documentation with the OS/runtime matrix.
- [ ] Run typecheck, tests, build, and strict OpenSpec validation.
