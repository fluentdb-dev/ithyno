# Responsive Settings Layout and AGMSG Dialog Scroll

## Why
1. The Settings tab (`Settings.tsx`) currently stretches across full viewport width without a max-width container or centering on wide screens, creating an unaligned and inconsistent layout compared to other primary dashboard tabs.
2. The AGMSG configuration and prerequisite modals (`AgmsgConfigModal.tsx`, `PrereqInstallModal.tsx`, and generic `.modal` / `.prereq-modal` containers) lack vertical scrolling limits (`max-height` and `overflow-y: auto`), causing buttons, input fields, and action footers to overflow and become unreachable on smaller screens or long content height.

## What Changes
- Update Settings page layout in `web/src/pages/Settings.tsx` and `web/src/styles.css` to add responsive max-width container constraints (`max-width: 1100px`, `margin: 0 auto`) and consistent responsive padding.
- Update modal styles in `web/src/styles.css` (`.modal`, `.prereq-modal`, `.agmsg-config-modal`, `.modal-content`) to enforce `max-height: 85vh` and `overflow-y: auto`, ensuring dialog footers and action buttons stay visible and accessible with proper scrolling.

## Impact
- **Settings Page**: Consistent centered layout on wide monitors matching Overview/Kanban aesthetics.
- **AGMSG & Prereq Modals**: Fully readable and scrollable dialogs regardless of viewport height or screen resolution.
