import { useEffect, useState } from "react";
import { fetchAgentJobDiff } from "../api";
import type { DiffFile, DiffHunk, DiffLine, DiffPayload } from "../types";

/**
 * Diff view for one agent job. Fetches /api/agents/jobs/:id/diff and renders
 * a file tree on the left with the selected file's hunks on the right. The
 * "Output" / "Diff" tabbing is the parent's concern; this component just
 * renders the diff once asked.
 */
export function DiffView({ jobId }: { jobId: string }) {
  const [payload, setPayload] = useState<DiffPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setError(null);
    setSelectedPath(null);
    fetchAgentJobDiff(jobId)
      .then((p) => {
        if (cancelled) return;
        setPayload(p);
        if (p && p.files.length > 0) {
          setSelectedPath(p.files[0].newPath ?? p.files[0].oldPath);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (error) return <p className="parse-error">Failed to load diff: {error}</p>;
  if (!payload) return <p className="empty">Loading diff…</p>;
  if (payload.files.length === 0) {
    return <p className="empty">No changes on this branch yet.</p>;
  }

  const selected =
    payload.files.find(
      (f) => (f.newPath ?? f.oldPath) === selectedPath,
    ) ?? payload.files[0];

  // Multi-file diffs show the tree; single-file omits it.
  const multi = payload.files.length > 1;

  return (
    <div className={`diff-view${multi ? " multi" : ""}`}>
      {multi && (
        <aside className="diff-tree">
          <ul>
            {payload.files.map((f) => {
              const path = f.newPath ?? f.oldPath ?? "(unknown)";
              const active = path === (selected.newPath ?? selected.oldPath);
              return (
                <li key={path}>
                  <button
                    className={active ? "active" : ""}
                    onClick={() => setSelectedPath(path)}
                  >
                    <span className="diff-tree-path">{path}</span>
                    <span className="diff-tree-stats">
                      {f.stats.insertions > 0 && (
                        <span className="diff-add-count">+{f.stats.insertions}</span>
                      )}
                      {f.stats.deletions > 0 && (
                        <span className="diff-del-count">−{f.stats.deletions}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      )}
      <section className="diff-content">
        <FileDiff file={selected} />
      </section>
    </div>
  );
}

function FileDiff({ file }: { file: DiffFile }) {
  const headerPath =
    file.kind === "renamed" && file.oldPath && file.newPath
      ? `${file.oldPath} → ${file.newPath}`
      : (file.newPath ?? file.oldPath ?? "(unknown)");
  return (
    <article className="diff-file">
      <header className="diff-file-head">
        <span className={`diff-kind kind-${file.kind}`}>{file.kind}</span>
        <span className="diff-file-path">{headerPath}</span>
        <span className="diff-file-stats">
          {file.stats.insertions > 0 && (
            <span className="diff-add-count">+{file.stats.insertions}</span>
          )}{" "}
          {file.stats.deletions > 0 && (
            <span className="diff-del-count">−{file.stats.deletions}</span>
          )}
        </span>
      </header>
      {file.isBinary ? (
        <p className="empty">Binary file</p>
      ) : (
        file.hunks.map((h, i) => <HunkBlock key={i} hunk={h} />)
      )}
      {file.truncated && (
        <p className="muted diff-truncated">
          Truncated — view the full diff in a terminal with{" "}
          <code>git diff {file.oldPath ?? "/dev/null"}..{file.newPath ?? "/dev/null"}</code>
        </p>
      )}
    </article>
  );
}

function HunkBlock({ hunk }: { hunk: DiffHunk }) {
  // Per-line, track old/new line numbers for the gutter.
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  return (
    <div className="diff-hunk">
      <div className="diff-hunk-head">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        {hunk.header && <span className="muted">{` ${hunk.header}`}</span>}
      </div>
      {hunk.lines.map((l, i) => {
        const row = <Row line={l} oldNo={oldLine} newNo={newLine} key={i} />;
        if (l.kind === "ctx") {
          oldLine++;
          newLine++;
        } else if (l.kind === "del") oldLine++;
        else if (l.kind === "add") newLine++;
        return row;
      })}
    </div>
  );
}

function Row({ line, oldNo, newNo }: { line: DiffLine; oldNo: number; newNo: number }) {
  const showOld = line.kind !== "add";
  const showNew = line.kind !== "del";
  return (
    <div className={`diff-row diff-${line.kind}`}>
      <span className="diff-gutter">{showOld ? oldNo : ""}</span>
      <span className="diff-gutter">{showNew ? newNo : ""}</span>
      <span className="diff-prefix">
        {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
      </span>
      <span className="diff-text">{line.text}</span>
    </div>
  );
}
