#!/bin/bash

set -e

echo ">>> Installing Node Exporter (system metrics: CPU, memory, disk)..."
NODE_EXPORTER_VERSION="1.8.2"
cd /tmp
wget -q https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz
tar xvf node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz
sudo mv node_exporter-${NODE_EXPORTER_VERSION}.linux-amd64/node_exporter /usr/local/bin/

# Create a dedicated user
sudo useradd -rs /bin/false node_exporter || true

# systemd service for node_exporter
sudo tee /etc/systemd/system/node_exporter.service > /dev/null <<EOF
[Unit]
Description=Prometheus Node Exporter
After=network.target

[Service]
User=node_exporter
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter
echo ">>> Node Exporter running on port 9100 (metrics at http://<server-ip>:9100/metrics)"

# ---- Custom app health-check + system metrics logger ----
echo ">>> Setting up custom health-check script..."
sudo mkdir -p /opt/monitoring
sudo tee /opt/monitoring/healthcheck.sh > /dev/null <<'EOF'
#!/bin/bash
# Logs CPU, memory, disk usage and Node app process health every run.
LOGFILE="/var/log/app-monitoring.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print $2 + $4"%"}')
MEM=$(free -m | awk '/Mem:/ {printf "%.2f%%", $3/$2*100}')
DISK=$(df -h / | awk 'NR==2 {print $5}')

if sudo -u ubuntu pm2 describe node-app > /dev/null 2>&1 && \
   sudo -u ubuntu pm2 describe node-app | grep -q "status.*online"; then
    APP_STATUS="RUNNING"
else
    APP_STATUS="DOWN"
fi

echo "$TIMESTAMP | CPU: $CPU | MEM: $MEM | DISK: $DISK | node-app: $APP_STATUS" >> "$LOGFILE"

# Optional: auto-restart if app is down
if [ "$APP_STATUS" == "DOWN" ]; then
    echo "$TIMESTAMP | ALERT: node-app is down, attempting restart..." >> "$LOGFILE"
    sudo -u ubuntu pm2 restart node-app
fi
EOF

sudo chmod +x /opt/monitoring/healthcheck.sh

# Cron: run every minute
( sudo crontab -l 2>/dev/null; echo "* * * * * /opt/monitoring/healthcheck.sh" ) | sudo crontab -

echo ""
echo "=========================================================="
echo "Monitoring set up:"
echo "  - Node Exporter metrics: http://<server-ip>:9100/metrics"
echo "  - App/system health log: /var/log/app-monitoring.log (updated every minute)"
echo "=========================================================="
