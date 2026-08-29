#!/bin/sh
set -eu
script=$(CDPATH= cd -- "$(dirname "$0")/../templates/scripts" && pwd)/notify-waiting.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/notify-send" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$tmp/notify-send"
PATH="$tmp:$PATH" "$script" claude
! grep -E '(curl|wget|nc)' "$script"
