#!/bin/sh
# SPDX-License-Identifier: MIT
set -u

cli_name=${1:-CLI}
title="ithyno — CLI waiting"
body="$cli_name is waiting for your input"

if [ "$(uname -s 2>/dev/null || true)" = "Darwin" ] && command -v osascript >/dev/null 2>&1; then
  escaped_body=$(printf '%s' "$body" | sed 's/\\/\\\\/g; s/"/\\"/g')
  escaped_title=$(printf '%s' "$title" | sed 's/\\/\\\\/g; s/"/\\"/g')
  osascript -e "display notification \"$escaped_body\" with title \"$escaped_title\"" >/dev/null 2>&1 || true
  exit 0
fi

if command -v notify-send >/dev/null 2>&1; then
  notify-send "$title" "$body" >/dev/null 2>&1 || true
  exit 0
fi

# Notification tools are optional; hooks must never make the CLI fail.
exit 0
