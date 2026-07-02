import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

export interface MenuHandlers {
  onOpenProject(): void;
  onOpenRecent(path: string): void;
  onQuit(): void;
  onOpenDocumentation(): void;
  getRecent(): string[];
  getWindow(): BrowserWindow | null;
}

export function buildAppMenu(handlers: MenuHandlers): Menu {
  const isMac = process.platform === 'darwin';
  const recent = handlers.getRecent();

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
        {
          label: 'Report an Issue',
          click: () => {
            void shell.openExternal('https://github.com/anthropics/openspec-ui/issues');
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
