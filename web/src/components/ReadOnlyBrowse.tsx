// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * UNUSED as of simplify-browse-to-kanban (2026-07-24).
 *
 * The dashboard's "Browse" button now sets `browseMode = true` and
 * App.tsx renders the normal chrome (topbar + empty Kanban) directly,
 * bypassing this component. The `/api/browse/markdown-tree` and
 * `/api/browse/markdown` server endpoints are also inert.
 *
 * Preserved on disk in case a future "docs preview" feature reuses
 * the two-pane markdown tree pattern. If it stays inert past the
 * next spec-tightening review, delete this file and the associated
 * server/browse.ts endpoints.
 *
 * Original description ↓
 * Read-only markdown browser. Shown when browseMode === true in the store.
 *
 * - Fetches /api/browse/markdown-tree on mount and renders a left sidebar.
 * - Clicking a file fetches /api/browse/markdown?path=<rel> and renders
 *   the content with react-markdown + remark-gfm in the right pane.
 * - An "Exit browse mode" button at the top-right returns to the decision
 *   panel via setBrowseMode(false).
 *
 * The entire dashboard chrome (tabs, terminal, etc.) is hidden while
 * browseMode === true — App.tsx renders ONLY this component.
 *
 * Landed by unify-open-project-3-branch.
 */
import { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "../store";
import type { MarkdownTreeNode } from "../types";
import { getSessionToken } from "../runtime";

function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  const h: Record<string, string> = {};
  if (token) h["X-Session-Token"] = token;
  return h;
}

async function fetchMarkdownTree(): Promise<MarkdownTreeNode[]> {
  const res = await fetch("/api/browse/markdown-tree", { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET /api/browse/markdown-tree failed: ${res.status}`);
  return res.json() as Promise<MarkdownTreeNode[]>;
}

async function fetchMarkdownFile(path: string): Promise<string> {
  const res = await fetch(`/api/browse/markdown?path=${encodeURIComponent(path)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`GET /api/browse/markdown failed: ${res.status}`);
  const body = await res.json() as { path: string; content: string };
  return body.content;
}

// ---------------------------------------------------------------------------
// Tree sidebar
// ---------------------------------------------------------------------------

function TreeNode({
  node,
  selectedPath,
  onSelect,
  depth,
}: {
  node: MarkdownTreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth === 0);

  if (node.kind === "file") {
    const active = selectedPath === node.path;
    return (
      <li>
        <button
          className={`browse-file-btn${active ? " active" : ""}`}
          onClick={() => onSelect(node.path)}
          title={node.path}
        >
          {node.name}
        </button>
      </li>
    );
  }

  return (
    <li>
      <button
        className="browse-dir-btn"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="browse-dir-arrow">{expanded ? "▾" : "▸"}</span>
        {node.name}/
      </button>
      {expanded && node.children && node.children.length > 0 && (
        <ul className="browse-tree" style={{ paddingLeft: 12 }}>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function BrowseSidebar({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: MarkdownTreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <aside className="browse-sidebar">
      <h3>Files</h3>
      <ul className="browse-tree">
        {nodes.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={0}
          />
        ))}
      </ul>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReadOnlyBrowse() {
  const setBrowseMode = useStore((s) => s.setBrowseMode);
  const state = useStore((s) => s.state);

  const [tree, setTree] = useState<MarkdownTreeNode[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Fetch the tree on mount.
  useEffect(() => {
    fetchMarkdownTree()
      .then((nodes) => {
        setTree(nodes);
        // Auto-select the first file if there's one at the root level.
        const first = nodes.find((n) => n.kind === "file");
        if (first) handleSelect(first.path);
      })
      .catch((err) => {
        setTreeError(err instanceof Error ? err.message : String(err));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = useCallback(async (path: string) => {
    setSelectedPath(path);
    setContentLoading(true);
    setContentError(null);
    try {
      const text = await fetchMarkdownFile(path);
      setContent(text);
    } catch (err) {
      setContentError(err instanceof Error ? err.message : String(err));
    } finally {
      setContentLoading(false);
    }
  }, []);

  return (
    <div className="read-only-browse">
      <div className="browse-header">
        <span className="browse-badge">read-only</span>
        <span className="browse-root muted">
          {state?.root ? <code>{state.root.replace(/\/openspec$/, "")}</code> : "Browse mode"}
        </span>
        <button
          className="browse-exit-btn"
          onClick={() => setBrowseMode(false)}
        >
          Back to decision
        </button>
      </div>

      <div className="browse-body">
        {treeError ? (
          <div className="parse-error">Failed to load file tree: {treeError}</div>
        ) : tree === null ? (
          <p className="empty">Loading file tree…</p>
        ) : tree.length === 0 ? (
          <p className="empty">No markdown files found in this directory.</p>
        ) : (
          <>
            <BrowseSidebar
              nodes={tree}
              selectedPath={selectedPath}
              onSelect={(path) => void handleSelect(path)}
            />
            <section className="browse-viewer">
              {contentLoading && <p className="empty">Loading…</p>}
              {contentError && (
                <div className="parse-error">Failed to load file: {contentError}</div>
              )}
              {!contentLoading && !contentError && content !== null && (
                <article className="browse-article">
                  <div className="browse-file-path muted">{selectedPath}</div>
                  <div className="docs-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                  </div>
                </article>
              )}
              {!contentLoading && !contentError && content === null && (
                <div className="empty-state">
                  <p className="muted">Select a file to view.</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
