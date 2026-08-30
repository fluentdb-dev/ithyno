#!/bin/sh
# SPDX-License-Identifier: MIT
set -u

cli_name=${1:-CLI}
title="ithyno — CLI waiting"
body="$cli_name is waiting for your input"

cwd="${ITHYNO_PROJECT_ROOT:-${PWD}}"
if [ ! -t 0 ]; then
  hook_input=$(cat)
  if command -v jq >/dev/null 2>&1; then
    hook_cwd=$(printf '%s' "$hook_input" | jq -r '.cwd // empty' 2>/dev/null || true)
    [ -n "$hook_cwd" ] && cwd="$hook_cwd"
  fi
fi

project_name=${cwd##*/}
project_name=${project_name:-project}
project_id=$(printf '%s' "$cwd" | cksum | awk '{print $1}')
notification_group="ithyno:$cli_name:$project_id"
body="$cli_name is waiting for your input in $project_name"

if [ "$(uname -s 2>/dev/null || true)" = "Darwin" ] && command -v osascript >/dev/null 2>&1; then
  escaped_body=$(printf '%s' "$body" | sed 's/\\/\\\\/g; s/"/\\"/g')
  escaped_title=$(printf '%s' "$title" | sed 's/\\/\\\\/g; s/"/\\"/g')
  if command -v alerter >/dev/null 2>&1; then
    # alerter supports click callbacks; keep it detached so the hook never
    # blocks the CLI while waiting for the user to click the notification.
    ITHYNO_CWD="$cwd" ITHYNO_TITLE="$title" ITHYNO_BODY="$body" ITHYNO_GROUP="$notification_group" \
      nohup sh -c 'result=$(alerter --title "$ITHYNO_TITLE" --message "$ITHYNO_BODY" --group "$ITHYNO_GROUP" --timeout 86400 2>/dev/null); case "$result" in @CONTENTCLICKED|@ACTIONCLICKED) [ -d "$ITHYNO_CWD" ] && open "$ITHYNO_CWD" ;; esac' \
      >/dev/null 2>&1 </dev/null &
  else
    osascript -e "display notification \"$escaped_body\" with title \"$escaped_title\"" >/dev/null 2>&1 || true
  fi
  exit 0
fi

if command -v notify-send >/dev/null 2>&1; then
  notify-send "$title" "$body" >/dev/null 2>&1 || true
  exit 0
fi

# Notification tools are optional; hooks must never make the CLI fail.
exit 0
