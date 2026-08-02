# Capability: UI Layout & Dialogs

## ADDED / MODIFIED Requirements

### MODIFIED: Settings Page Responsive Container
- The Settings page SHALL restrict its maximum container width (e.g. `max-width: 1100px`) and center itself horizontally within the main viewport on wide displays, matching the responsive layout structure of other main dashboard tabs.

### MODIFIED: Modal Dialog Scroll Overflow
- All modal dialogs, including AGMSG configuration and prerequisite installation modals, SHALL enforce a maximum height (`max-height: 85vh`) and enable vertical scrolling (`overflow-y: auto`) for content overflow, ensuring all modal actions, form fields, and buttons remain fully visible and accessible.
