import { Link } from "react-router-dom";
import { useStore } from "../store";

/**
 * Read-only history of archived changes. Lives at /archive — separate from
 * the Overview kanban because archived volume grows unbounded.
 */
export function Archive() {
  const archive = useStore((s) => s.state?.archive ?? []);

  return (
    <div className="archive-page">
      <h2>
        Archived <span className="muted">({archive.length})</span>
      </h2>
      {archive.length === 0 ? (
        <p className="empty">No archived changes yet.</p>
      ) : (
        <ul className="archive-page-list">
          {archive.map((a) => (
            <li key={a.id} className="archive-page-row">
              <Link to={`/change/${encodeURIComponent(a.id)}`} className="archive-page-id">
                {a.id}
              </Link>
              <span className="muted">
                {a.archivedAt && <span className="archive-page-date">{a.archivedAt}</span>}
                <span className="archive-page-progress">
                  {a.progress.done}/{a.progress.total}
                </span>
                {a.outcome ? (
                  <span className="archive-outcome-flag">✓ outcome</span>
                ) : (
                  <span className="archive-outcome-missing">no outcome</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
