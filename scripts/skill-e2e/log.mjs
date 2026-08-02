// SPDX-License-Identifier: GPL-3.0-or-later
// Tiny logger for skill-e2e — timestamps + level prefix, no deps.
// Keeps output greppable for post-mortem.

const START = Date.now();

function elapsed() {
  const ms = Date.now() - START;
  const s = Math.floor(ms / 1000);
  const rem = ms - s * 1000;
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const mmm = String(rem).padStart(3, "0");
  return `${mm}:${ss}.${mmm}`;
}

export function info(msg) {
  console.log(`[skill-e2e ${elapsed()}] ${msg}`);
}

export function warn(msg) {
  console.warn(`[skill-e2e ${elapsed()}] WARN: ${msg}`);
}

export function error(msg) {
  console.error(`[skill-e2e ${elapsed()}] ERROR: ${msg}`);
}

export function section(msg) {
  console.log("");
  console.log(`[skill-e2e ${elapsed()}] === ${msg} ===`);
}
