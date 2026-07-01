## 1. Lift Terminal to App level
- [x] 1.1 Render `<Terminal />` once inside App when `terminalAvailable` is true
- [x] 1.2 Wrap it in a docked `<aside class="global-terminal">` pane
- [x] 1.3 Toggle the pane via CSS `display: none` when `terminalVisible` is false (do not unmount)

## 2. Remove the per-page mount
- [x] 2.1 Delete the inline Terminal import and conditional from ChangeDetail
- [x] 2.2 Keep the Hide/Show toggle button in ChangeDetail header (it already flips the global flag)
- [x] 2.3 Remove the now-dead `.change-detail.with-terminal` / `.change-terminal` split CSS

## 3. Global docked layout
- [x] 3.1 Add `.global-terminal` styles: fixed right, full height under topbar
- [x] 3.2 Add a body class or main padding so content does not slide under the terminal when visible
- [x] 3.3 Width controlled by a CSS custom property for easy adjustment

## 4. Verification
- [x] 4.1 Run a command, navigate to another change, return — same shell, same scrollback
- [x] 4.2 Hide the pane, run nothing, show it again — same shell
- [x] 4.3 Navigate to Overview / Specs — terminal pane is still visible
- [x] 4.4 Server log shows the PTY is not killed on navigation or hide