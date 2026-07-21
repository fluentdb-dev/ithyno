// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from "react";
import { AboutModal } from "./AboutModal";

/**
 * Small circular "?" icon button in the topbar-right.
 * Clicking it opens the About modal. Rendered on all shells
 * (web, Electron, VS Code) — no shell guard needed.
 */
export function AboutButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="about-btn"
        aria-label="About ithyno"
        title="About ithyno"
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && <AboutModal onClose={() => setOpen(false)} />}
    </>
  );
}
