// SPDX-License-Identifier: GPL-3.0-or-later
// Preload for the onboarding BrowserWindow. Exposes a minimal API on
// window.ithynoOnboarding that the shared React onboarding page
// (web/src/pages/OnboardingProject.tsx) uses to signal main.
// (add-new-project-onboarding-window.)
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ithynoOnboarding', {
  onboardingOpen: (target: string): void => {
    ipcRenderer.send('onboarding-open', target);
  },
  onboardingClose: (): void => {
    ipcRenderer.send('onboarding-close');
  },
});
