#!/usr/bin/env bash
# Deploy LE Designer to a Linux server over SSH (plain Node + systemd; no Docker needed).
#   deploy/deploy.sh user@server            # first run installs the systemd unit; later runs just update + restart
# Requirements on the server: Node 22+, rsync, sudo. Data lives in /var/lib/le-designer (kept across deploys).
set -euo pipefail
HOST="${1:?usage: deploy/deploy.sh user@server}"
APP=/opt/le-designer
DATA=/var/lib/le-designer
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ building"
(cd "$HERE" && npm ci && npm run build)

echo "→ syncing to $HOST:$APP"
ssh "$HOST" "sudo mkdir -p $APP $DATA/designs $DATA/libraries && sudo chown -R \$USER $APP"
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude 'designs/.history' --exclude 'designs/stress.json' \
  "$HERE/" "$HOST:$APP/"

echo "→ installing production dependencies + seeding samples (first time only)"
ssh "$HOST" bash -s <<REMOTE
set -e
cd $APP && npm ci --omit=dev
if [ -z "\$(ls -A $DATA/designs)" ]; then cp -n $APP/designs/*.json $DATA/designs/ 2>/dev/null || true; fi
if [ -z "\$(ls -A $DATA/libraries)" ]; then cp -n $APP/libraries/*.json $DATA/libraries/ 2>/dev/null || true; fi
id -u le >/dev/null 2>&1 || sudo useradd -r -s /usr/sbin/nologin le
sudo chown -R le:le $DATA
if [ ! -f /etc/systemd/system/le-designer.service ]; then
  sudo cp $APP/deploy/le-designer.service /etc/systemd/system/le-designer.service
  sudo systemctl daemon-reload && sudo systemctl enable le-designer
fi
sudo systemctl restart le-designer
sleep 1 && curl -fsS http://127.0.0.1:4000/api/docs >/dev/null && echo "✓ le-designer is up on :4000"
REMOTE
echo "Done. Put nginx (deploy/nginx.conf) in front for TLS + auth."
