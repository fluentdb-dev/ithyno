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
                <IconRepo />
                <span>Open Repository</span>
              </a>
              <a
                href={info.issuesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ghost modal-btn"
              >
                <IconIssue />
                <span>Report an Issue</span>
              </a>
              {info.sponsors.map((s) => (
                <a
                  key={s.label}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ghost modal-btn"
                >
                  <IconSponsor url={s.url} />
                  <span>Sponsor via {s.label}</span>
                </a>
              ))}
              <a
                href={info.releasesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ghost modal-btn"
              >
                <IconUpdate />
                <span>Check for Updates</span>
              </a>
              <a
                href={info.licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ghost modal-btn"
              >
                <IconLicense />
                <span>View License</span>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Inline SVG icons — 14×14, stroke=currentColor, matches ThemeToggle
 * pattern. Icons are Lucide-inspired (MIT). Sized to align with 13px
 * button labels. aria-hidden so screen readers read the label only. */

const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconRepo() {
  // GitHub logo — recognizable for the "Open Repository" action.
  return (
    <svg {...iconProps}>
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

function IconIssue() {
  // Alert circle — issue reporting.
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconSponsor({ url }: { url: string }) {
  // Ko-fi → coffee cup, GitHub Sponsors → heart, anything else → heart.
  if (/ko-fi\.com/i.test(url)) {
    return (
      <svg {...iconProps}>
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    );
  }
  return (
    <svg {...iconProps}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function IconUpdate() {
  // Download-cloud — check for updates.
  return (
    <svg {...iconProps}>
      <polyline points="8 17 12 21 16 17" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
    </svg>
  );
}

function IconLicense() {
  // File-text — view license.
  return (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
