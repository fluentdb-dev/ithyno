// SPDX-License-Identifier: GPL-3.0-or-later

const SAFE_CHANGE_ID = /^[A-Za-z0-9._-]+$/;

/**
 * Change IDs become directory and branch-name components. Keep them to one
 * segment and reject the two dot aliases even though they match the charset.
 */
export function isSafeChangeId(id: string): boolean {
  return id.length > 0 && id !== "." && id !== ".." && SAFE_CHANGE_ID.test(id);
}
