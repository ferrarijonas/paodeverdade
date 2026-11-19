#!/usr/bin/env bash
# Instala a ponte WhatsApp (boas-vindas da lista) numa VM Ubuntu.
# Roda como root, com bridge/ + config.local.json já extraídos em /opt/zap-bridge.
set -euo pipefail

BASE=/opt/zap-bridge
BRIDGE=$BASE/bridge

[ -f "$BASE/config.local.json" ] || [ -s /etc/zap-boasvindas.env ] || {
  echo "Falta $BASE/config.local.json (PAINEL_SENHA)."
  exit 1
}
[ -d "$BRIDGE/baileys_auth" ] || echo "AVISO: baileys_auth ausente — será preciso parear de novo."

apt-get update -y
apt-get install -y curl util-linux ca-certificates

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# 1 GB de swap: o Micro tem 1 GB de RAM e o npm ci pode estourar sem isso.
if ! swapon --show | grep -q .; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

id zap >/dev/null 2>&1 || useradd --system --home "$BASE" --shell /usr/sbin/nologin zap

cd "$BRIDGE"
npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

if [ -f "$BASE/config.local.json" ]; then
  SENHA=$(node -p "JSON.parse(require('fs').readFileSync('$BASE/config.local.json','utf8')).PAINEL_SENHA")
  install -m 600 /dev/null /etc/zap-boasvindas.env
  printf 'PAINEL_SENHA=%s\n' "$SENHA" > /etc/zap-boasvindas.env
  chmod 600 /etc/zap-boasvindas.env
  shred -u "$BASE/config.local.json"
fi

install -m 644 "$BRIDGE/vm/zap-boasvindas.service" /etc/systemd/system/
install -m 644 "$BRIDGE/vm/zap-boasvindas.timer" /etc/systemd/system/
chown -R zap:zap "$BASE"
systemctl daemon-reload
systemctl enable --now zap-boasvindas.timer
systemctl start zap-boasvindas.service || true

echo
echo "Instalado. Timer a cada 10 min."
echo "Teste seco:  sudo -u zap env \$(cat /etc/zap-boasvindas.env) node $BRIDGE/zap-sender.js fila --campanha boasvindas --publico espera"
echo "Log:         journalctl -u zap-boasvindas -n 50 --no-pager"
