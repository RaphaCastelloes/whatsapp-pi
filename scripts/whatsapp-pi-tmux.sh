#!/usr/bin/env bash
set -Eeuo pipefail

SESSION_NAME="${WHATSAPP_PI_TMUX_SESSION:-whatsapp-pi}"
PI_COMMAND="${PI_COMMAND:-pi}"

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

tmux new-session -d -s "$SESSION_NAME" -- bash -lc "exec $PI_COMMAND --whatsapp-pi-online"

# Keep the systemd service alive while the tmux session is alive.
while tmux has-session -t "$SESSION_NAME" 2>/dev/null; do
    sleep 2
done

exit 1
