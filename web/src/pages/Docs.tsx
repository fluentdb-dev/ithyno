// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo } from "react";
import { useParams, NavLink, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "../store";
import type { DocsEntry } from "../types";

const KNOWN_FM_KEYS = ["status", "tags", "source", "related", "promoted_to"] as const;

export function Docs() {
  const docs = useStore((s) => s.docs);
  const openDoc = useStore((s) => s.openDoc);
  const loadDocs = useStore((s) => s.loadDocs);
  const openDocPath = useStore((s) => s.openDocPath);

  // /docs/* — splat param holds the doc path (without .md).
  const { "*": splat } = useParams<{ "*": string }>();
  const currentPath = splat ? `${splat}.md` : null;

  useEffect(() => {
    if (!docs) void loadDocs();
  }, [docs, loadDocs]);

  useEffect(() => {
    void openDocPath(currentPath);
  }, [currentPath, openDocPath]);

  if (!docs) {
    return <p className="empty">Loading docs…</p>;
  }
  if (!docs.exists) {
    return (
      <div className="empty-state">
        <h2>No docs/ directory</h2>
        <p>
          Create a <code>docs/</code> directory at the project root to start
          adding stage-① ideas and stage-② design docs.
        </p>
      </div>
    );
  }

  return (
    <div className="docs-page">
      <aside className="docs-sidebar">
        <h3>Docs</h3>
        <DocsTree entries={docs.entries} currentPath={currentPath} />
        <DocsLegend />
      </aside>
      <section className="docs-viewer">
        {currentPath ? (
          openDoc ? (
            <DocsViewer />
          ) : (
            <p className="empty">Loading…</p>
          )
        ) : (
          <div className="empty-state">
            <p className="muted">Select a doc to view.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function DocsTree({
  entries,
  currentPath,
  depth = 0,
}: {
  entries: DocsEntry[];
  currentPath: string | null;
  depth?: number;
}) {
  return (
    <ul className="docs-tree" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {entries.map((e) => (
        <li key={e.path}>
          {e.kind === "dir" ? (
            <>
              <div className="docs-dir">{e.name}/</div>
              <DocsTree entries={e.children} currentPath={currentPath} depth={depth + 1} />
            </>
          ) : (
            <DocsFileEntry entry={e} active={currentPath === e.path} />
          )}
        </li>
      ))}
    </ul>
  );
}

function DocsFileEntry({
  entry,
  active,
}: {
  entry: Extract<DocsEntry, { kind: "file" }>;
  active: boolean;
}) {
  // Status dot for files under ideas/.
  const isIdea = entry.path.startsWith("ideas/");
  const status =
    isIdea && entry.frontmatter && typeof entry.frontmatter.status === "string"
      ? (entry.frontmatter.status as string)
      : null;
  // Drop the .md suffix and any leading YYYY-MM-DD- for readability.
  const display = entry.name
    .replace(/\.md$/, "")
    .replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const linkPath = `/docs/${entry.path.replace(/\.md$/, "")}`;
  return (
    <NavLink to={linkPath} className={`docs-file${active ? " active" : ""}`}>
      {isIdea && <span className={`status-dot status-${status ?? "unknown"}`} title={status ?? "no status"} />}
      <span className="docs-file-name">{display}</span>
    </NavLink>
  );
}

const STATUS_LEGEND = [
  { key: "idea", label: "idea" },
  { key: "exploring", label: "exploring" },
  { key: "shaped", label: "shaped" },
  { key: "promoted", label: "promoted" },
  { key: "dropped", label: "dropped" },
] as const;

function DocsLegend() {
  return (
    <div className="docs-legend">
      <div className="docs-legend-title">Idea status</div>
      <ul>
        {STATUS_LEGEND.map((s) => (
          <li key={s.key}>
            <span className={`status-dot status-${s.key}`} />
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocsViewer() {
  const openDoc = useStore((s) => s.openDoc)!;
  const fm = openDoc.frontmatter ?? {};

  const known: Record<string, unknown> = {};
  const unknown: [string, unknown][] = [];
  for (const [k, v] of Object.entries(fm)) {
    if ((KNOWN_FM_KEYS as readonly string[]).includes(k)) known[k] = v;
    else unknown.push([k, v]);
  }

  const tags = useMemo(() => {
    const t = known.tags;
    return Array.isArray(t) ? (t as unknown[]).map(String) : [];
  }, [known.tags]);

  const related = useMemo(() => {
    const r = known.related;
    return Array.isArray(r) ? (r as unknown[]).map(String) : [];
  }, [known.related]);

  return (
    <article className="docs-article">
      <div className="docs-path">{openDoc.path}</div>
      {(known.status || tags.length > 0 || known.source || known.promoted_to || related.length > 0) && (
        <div className="docs-meta">
          {typeof known.status === "string" && (
            <span className={`docs-badge status-${known.status}`}>{known.status}</span>
          )}
          {typeof known.source === "string" && (
            <span className="docs-badge source">{known.source}</span>
          )}
          {tags.map((t) => {
            const i = t.indexOf("/");
            const ns = i < 0 ? "other" : t.slice(0, i);
            const name = i < 0 ? t : t.slice(i + 1);
            return (
              <Link
                key={t}
                to={`/tags/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`}
                className="docs-tag clickable"
              >
                {t}
              </Link>
            );
          })}
          {typeof known.promoted_to === "string" && known.promoted_to && (
            <span className="docs-promoted">
              → <code>{known.promoted_to}</code>
            </span>
          )}
        </div>
      )}
      {related.length > 0 && (
        <details className="docs-related">
          <summary>related ({related.length})</summary>
          <ul>
            {related.map((r) => (
              <li key={r}>
                <code>{r}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      {unknown.length > 0 && (
        <details className="docs-more-meta">
          <summary>more metadata</summary>
          <ul>
            {unknown.map(([k, v]) => (
              <li key={k}>
                <code>{k}</code>: <code>{JSON.stringify(v)}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="docs-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{openDoc.body}</ReactMarkdown>
      </div>
    </article>
  );
}

