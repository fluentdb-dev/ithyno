// SPDX-License-Identifier: GPL-3.0-or-later
import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

export type SponsorLink = { label: string; url: string };

export interface AboutConfig {
  name: string;
  version: string;
  license: string;
  description: string;
  repositoryUrl: string;
  issuesUrl: string;
  releasesUrl: string;
  licenseUrl: string;
  sponsors: SponsorLink[];
}

export const IPC_TERMINAL_RESTART = 'ithyno:terminal-restart';
export const IPC_OPEN_ABOUT = 'ithyno:open-about';

export interface MenuHandlers {
  about: AboutConfig;
  onOpenProject(): void;
  onNewProject(): void;
  /** import-project-spec-generation: open OS folder picker then trigger import flow */
  onImportProject(): void;
  onOpenRecent(path: string): void;
  onQuit(): void;
  onOpenDocumentation(): void;
  getRecent(): string[];
  getWindow(): BrowserWindow | null;
}

export function buildAppMenu(handlers: MenuHandlers): Menu {
  const isMac = process.platform === 'darwin';
  const recent = handlers.getRecent();
  const { about } = handlers;

  const recentSubmenu: MenuItemConstructorOptions =
    recent.length === 0
      ? { label: 'Open Recent', submenu: [{ label: 'No recent projects', enabled: false }] }
      : {
          label: 'Open Recent',
          submenu: recent.map((p) => ({
            label: p,
            click: () => handlers.onOpenRecent(p),
          })),
        };

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'Open Project…',
        accelerator: 'CmdOrCtrl+O',
        click: () => handlers.onOpenProject(),
      },
      {
        label: 'New Project…',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => handlers.onNewProject(),
      },
      {
        label: 'Import Existing Project…',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => handlers.onImportProject(),
      },
      recentSubmenu,
      { type: 'separator' },
      {
        label: 'Close Project',
        accelerator: 'CmdOrCtrl+W',
        click: () => handlers.onQuit(),
      },
      ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }]),
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    fileMenu,
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: process.platform === 'darwin'
            ? 'Reload Terminal (⇧⌘K)'
            : 'Reload Terminal (Ctrl+Shift+K)',
          click: () => {
            const win = handlers.getWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send(IPC_TERMINAL_RESTART);
            }
          },
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }] as MenuItemConstructorOptions[])
          : ([{ role: 'close' }] as MenuItemConstructorOptions[])),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Documentation',
          click: () => handlers.onOpenDocumentation(),
        },
        { type: 'separator' },
        // On macOS "About ithyno" is auto-inserted under the app menu — skip
        // it here so there's no duplicate About item under Help.
        ...(isMac
          ? []
          : [
              {
                label: `About ${about.name}`,
                click: () => {
                  app.showAboutPanel();
                  const win = handlers.getWindow();
                  if (win && !win.isDestroyed()) {
                    win.webContents.send(IPC_OPEN_ABOUT);
                  }
                },
              } as MenuItemConstructorOptions,
              { type: 'separator' as const },
            ]),
        // Sponsor entries — one item per sponsors array entry. When there's
        // only one entry, render directly (no submenu). When multiple entries
        // exist (future GitHub Sponsors), wrap in a "Sponsor" submenu.
        ...(about.sponsors.length === 1
          ? [
              {
                label: `Sponsor via ${about.sponsors[0]!.label}`,
                click: () => void shell.openExternal(about.sponsors[0]!.url),
              } as MenuItemConstructorOptions,
            ]
          : [
              {
                label: 'Sponsor',
                submenu: about.sponsors.map((s) => ({
                  label: s.label,
                  click: () => void shell.openExternal(s.url),
                })),
              } as MenuItemConstructorOptions,
            ]),
        {
          label: 'Check for Updates…',
          click: () => void shell.openExternal(about.releasesUrl),
        },
        {
          label: 'Report an Issue',
          click: () => void shell.openExternal(about.issuesUrl),
        },
        {
          label: 'View License',
          click: () => void shell.openExternal(about.licenseUrl),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
