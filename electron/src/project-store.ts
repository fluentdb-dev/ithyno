// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface StoreShape {
  lastProject: string | null;
  recent: string[];
  windowState: WindowState;
}

const DEFAULT_STATE: StoreShape = {
  lastProject: null,
  recent: [],
  windowState: { width: 1400, height: 900 },
};

const RECENT_CAP = 10;

export class ProjectStore {
  private state: StoreShape;

  constructor(private readonly filePath: string) {
    this.state = this.load();
  }

  private load(): StoreShape {
    if (!existsSync(this.filePath)) return { ...DEFAULT_STATE, recent: [] };
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreShape>;
      return {
        lastProject: typeof parsed.lastProject === 'string' ? parsed.lastProject : null,
        recent: Array.isArray(parsed.recent) ? parsed.recent.filter((s) => typeof s === 'string') : [],
        windowState: this.normalizeWindowState(parsed.windowState),
      };
    } catch {
      return { ...DEFAULT_STATE, recent: [] };
    }
  }

  private normalizeWindowState(ws: unknown): WindowState {
    const out: WindowState = { width: DEFAULT_STATE.windowState.width, height: DEFAULT_STATE.windowState.height };
    if (ws && typeof ws === 'object') {
      const w = ws as Record<string, unknown>;
      if (typeof w.width === 'number' && w.width > 0) out.width = w.width;
      if (typeof w.height === 'number' && w.height > 0) out.height = w.height;
      if (typeof w.x === 'number') out.x = w.x;
      if (typeof w.y === 'number') out.y = w.y;
    }
    return out;
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  getLastProject(): string | null {
    return this.state.lastProject;
  }

  getRecent(): string[] {
    return [...this.state.recent];
  }

  getWindowState(): WindowState {
    return { ...this.state.windowState };
  }

  setProject(path: string): void {
    const abs = isAbsolute(path) ? path : resolve(path);
    this.state.lastProject = abs;
    const filtered = this.state.recent.filter((p) => p !== abs);
    filtered.unshift(abs);
    this.state.recent = filtered.slice(0, RECENT_CAP);
    this.persist();
  }

  clearLastProject(): void {
    this.state.lastProject = null;
    this.persist();
  }

  removeFromRecent(path: string): void {
    const before = this.state.recent.length;
    this.state.recent = this.state.recent.filter((p) => p !== path);
    if (this.state.lastProject === path) this.state.lastProject = null;
    if (this.state.recent.length !== before) this.persist();
  }

  setWindowState(ws: WindowState): void {
    this.state.windowState = ws;
    this.persist();
  }
}

export function stateFilePath(userDataDir: string): string {
  return join(userDataDir, 'state.json');
}
