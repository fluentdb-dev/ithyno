// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import type { AboutInfo } from "../types";

type Props = { onClose: () => void };

/** Module-level cache so /api/about is fetched at most once per page load. */
let _aboutCache: AboutInfo | null = null;

/**
 * Modal showing app name, version, license, description, and external-link
 * buttons. Follows the GitIdentityModal pattern: backdrop click / ESC / ×
 * closes it. Fetches /api/about once and caches for re-opens.
 *
 * No Settings-page section — this modal is the sole web entry point.
 *
 * External links use plain <a href target="_blank"> so that VS Code webviews
 * intercept them via the built-in link handler (→ env.openExternal) without
 * any bridge message, while web-browser and Electron shells open a new tab.
 */
export function AboutModal({ onClose }: Props) {
  const [info, setInfo] = useState<AboutInfo | null>(_aboutCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_aboutCache) return;
    let cancelled = false;
    fetch("/api/about")
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/about failed: ${res.status}`);
        return res.json() as Promise<AboutInfo>;
      })
      .then((data) => {
        if (cancelled) return;
        _aboutCache = data;
        setInfo(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on ESC key.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>About ithyno</h3>
          <button type="button" className="ghost modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <p className="muted">Failed to load about info: {error}</p>}

        {!info && !error && <p className="muted">Loading…</p>}

        {info && (
          <>
            <div className="about-meta">
              <div>
                <span className="muted">Name:</span> <strong>{info.name}</strong>
              </div>
              <div>
                <span className="muted">Version:</span> <code>{info.version}</code>
              </div>
              <div>
                <span className="muted">License:</span>{" "}
                <a href={info.licenseUrl} target="_blank" rel="noopener noreferrer">
                  {info.license}
                </a>
              </div>
              {info.description && (
                <div className="about-description muted">{info.description}</div>
              )}
            </div>

            <div className="modal-actions about-actions">
              <a
                href={info.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ghost modal-btn"
              >
                Open Repository
              </a>
              <a
                href={info.issuesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ghost modal-btn"
              >
                Report an Issue
              </a>
              {info.sponsors.map((s) => (
                <a
                  key={s.label}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ghost modal-btn"
                >
                  Sponsor via {s.label}
                </a>
              ))}
              <a
                href={info.releasesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ghost modal-btn"
              >
                Check for Updates
              </a>
              <a
                href={info.licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ghost modal-btn"
              >
                View License
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
