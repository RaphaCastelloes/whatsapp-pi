#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_BIN="$(command -v pi || true)"
TMUX_BIN="$(command -v tmux || true)"

if [[ -z "$PI_BIN" ]]; then
    echo "Erro: o comando 'pi' não foi encontrado no PATH." >&2
    exit 1
fi
if [[ -z "$TMUX_BIN" ]]; then
    echo "Erro: instale o tmux antes: sudo apt install tmux" >&2
    exit 1
fi
if ! command -v systemctl >/dev/null; then
    echo "Erro: systemd não foi encontrado." >&2
    exit 1
fi

# Installs the extension in this user's Pi agent configuration.
echo "Instalando whatsapp-pi no Pi..."
"$PI_BIN" install npm:whatsapp-pi

UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_FILE="$UNIT_DIR/whatsapp-pi.service"
mkdir -p "$UNIT_DIR"

# Values are generated so the service also works with Pi installed by the
# official installer (usually ~/.local/bin) or by npm/system packages.
sed \
    -e "s|__PROJECT_DIR__|${PROJECT_DIR//|/\\|}|g" \
    -e "s|__PI_DIR__|${HOME//|/\\|}|g" \
    -e "s|__PI_BIN__|${PI_BIN//|/\\|}|g" \
    -e "s|__TMUX_BIN__|${TMUX_BIN//|/\\|}|g" \
    "$PROJECT_DIR/systemd/whatsapp-pi.service.in" > "$UNIT_FILE"

systemctl --user daemon-reload
systemctl --user enable --now whatsapp-pi.service

# User services need lingering to start even when nobody is logged in.
if command -v loginctl >/dev/null && loginctl enable-linger "$USER" 2>/dev/null; then
    echo "Linger habilitado para $USER."
else
    echo "Aviso: não foi possível habilitar linger automaticamente. Execute: loginctl enable-linger $USER" >&2
fi

echo "Serviço instalado e iniciado."
echo "Ver status: systemctl --user status whatsapp-pi.service"
echo "Acessar o tmux: tmux attach -t whatsapp-pi"
