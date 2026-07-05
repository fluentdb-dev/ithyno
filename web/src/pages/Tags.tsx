// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../store";
import { fetchTagDetail } from "../api";
import type { ArtifactEntry, ArtifactType, TagDetail } from "../types";

const TYPE_ORDER: ArtifactType[] = ["change", "spec", "doc", "idea", "archive", "outcome"];
const TYPE_LABEL: Record<ArtifactType, string> = {
  change: "Changes",
  spec: "Specs",
  doc: "Docs",
  idea: "Ideas",
  archive: "Archived changes",
  outcome: "Outcomes",
};

export function Tags() {
  const tagIndex = useStore((s) => s.tagIndex);
  const tagIndexStale = useStore((s) => s.tagIndexStale);
  const loadTagIndex = useStore((s) => s.loadTagIndex);

  useEffect(() => {
    if (!tagIndex || tagIndexStale) void loadTagIndex();
  }, [tagIndex, tagIndexStale, loadTagIndex]);

  if (!tagIndex) return <p className="empty">Loading tags…</p>;

  const namespaces = tagIndex.namespaceOrder.filter((ns) => (tagIndex.byNamespace[ns]?.length ?? 0) > 0);

  if (namespaces.length === 0) {
    return (
      <div className="empty-state">
        <h2>No tags yet</h2>
        <p>
          Declare tags in markdown frontmatter — e.g.{" "}
          <code>tags: [feature/x, area/y]</code> — in <code>docs/</code> files or
          OpenSpec proposals. They will appear here grouped by namespace.
        </p>
      </div>
    );
  }

  return (
    <div className="tags-page">
      <h2>Tags</h2>
      <div className="tags-namespaces">
        {namespaces.map((ns) => (
          <section key={ns} className="tag-ns">
            <h3>
              <code>{ns}/</code>
            </h3>
            <ul>
              {tagIndex.byNamespace[ns].map((s) => {
                const name = s.tag.slice(ns === "other" ? 0 : ns.length + 1);
                return (
                  <li key={s.tag}>
                    <Link
                      to={`/tags/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`}
                      className="tag-chip clickable"
                      title={s.tag}
                    >
                      {name}
                      <span className="tag-count">{s.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function TagDetailPage() {
  // Splat after :ns can contain slashes (rare but the spec allows it).
  const { ns, "*": rest } = useParams<{ ns: string; "*": string }>();
  const [detail, setDetail] = useState<TagDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tagIndexStale = useStore((s) => s.tagIndexStale);

  const decodedNs = ns ? decodeURIComponent(ns) : "";
  const decodedName = rest ?? "";
  const fullTag = decodedNs === "other" ? decodedName : `${decodedNs}/${decodedName}`;

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchTagDetail(decodedNs, decodedName)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [decodedNs, decodedName, tagIndexStale]);

  if (error) {
    return (
      <div className="empty-state">
        <p>Failed to load tag: {error}</p>
        <Link to="/tags">← All tags</Link>
      </div>
    );
  }
  if (!detail) return <p className="empty">Loading…</p>;

  const groups = new Map<ArtifactType, ArtifactEntry[]>();
  for (const a of detail.artifacts) {
    const list = groups.get(a.type);
    if (list) list.push(a);
    else groups.set(a.type, [a]);
  }

  return (
    <div className="tag-detail">
      <Link to="/tags" className="back">
        ← All tags
      </Link>
      <h2>
        <span className="tag-chip">{fullTag}</span>{" "}
        <span className="muted">({detail.artifacts.length})</span>
      </h2>

      {detail.artifacts.length === 0 && <p className="empty">No artifacts carry this tag.</p>}

      {TYPE_ORDER.filter((t) => groups.has(t)).map((t) => (
        <section key={t} className="tag-detail-section">
          <h3>{TYPE_LABEL[t]}</h3>
          <ul>
            {groups.get(t)!.map((a) => (
              <li key={a.path}>
                {a.hrefIn ? (
                  <Link to={a.hrefIn}>{a.title}</Link>
                ) : (
                  <span>{a.title}</span>
                )}
                <span className="muted tag-detail-path">
                  {" "}
                  <code>{a.path}</code>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
