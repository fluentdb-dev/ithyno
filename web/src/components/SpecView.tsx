// SPDX-License-Identifier: GPL-3.0-or-later
import type { SpecDomain } from "../types";

export function SpecView({ spec }: { spec: SpecDomain }) {
  if (spec.parseError) {
    return (
      <div className="parse-error">
        <p>⚠ Could not parse spec.md ({spec.parseError}). Showing raw text:</p>
        <pre className="md-raw">{spec.raw}</pre>
      </div>
    );
  }

  return (
    <div className="spec-view">
      <div className="spec-head">
        <h3>{spec.domain}</h3>
      </div>
      {spec.purpose && <p className="spec-purpose">{spec.purpose}</p>}
      {spec.requirements.length === 0 && <p className="empty">No requirements.</p>}
      {spec.requirements.map((r, i) => (
        <div key={i} className="requirement">
          <h4>
            {r.delta && <span className={`delta delta-${r.delta}`}>{r.delta}</span>}
            {r.name}
          </h4>
          {r.text && <p className="req-text">{r.text}</p>}
          {r.scenarios.map((sc, j) => (
            <div key={j} className="scenario">
              <div className="scenario-name">Scenario: {sc.name}</div>
              <ul className="steps">
                {sc.steps.map((step, k) => (
                  <li key={k}>{step}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
