#!/usr/bin/env bash
set -Eeuo pipefail

SESSION_NAME="${WHATSAPP_PI_TMUX_SESSION:-whatsapp-pi}"
PI_COMMAND="${PI_COMMAND:-pi}"
PI_ENTRYPOINT="${PI_ENTRYPOINT:-}"
WORKING_DIRECTORY="${WHATSAPP_PI_WORKING_DIRECTORY:-$(pwd)}"

# systemd restarts this supervisor if Pi exits. The Pi process itself lives in tmux.
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    while tmux has-session -t "$SESSION_NAME" 2>/dev/null; do
        sleep 2
    done
    exit 1
fi

cleanup() {
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
}
trap cleanup TERM INT

if [[ -n "$PI_ENTRYPOINT" ]]; then
    tmux new-session -d -s "$SESSION_NAME" -c "$WORKING_DIRECTORY" -- bash -lc 'exec "$1" -e "$2" --whatsapp-pi-online' bash "$PI_COMMAND" "$PI_ENTRYPOINT"
else
    tmux new-session -d -s "$SESSION_NAME" -c "$WORKING_DIRECTORY" -- bash -lc 'exec "$1" --whatsapp-pi-online' bash "$PI_COMMAND"
fi

# Keep the systemd service alive while the tmux session is alive.
while tmux has-session -t "$SESSION_NAME" 2>/dev/null; do
    sleep 2
done

exit 1
