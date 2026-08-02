#!/bin/bash
set -e

DUCKDNS_DOMAIN="prachip"          
DUCKDNS_TOKEN="db0b63a8-8c65-4581-bd75-c12914814a79"
FULL_DOMAIN="${DUCKDNS_DOMAIN}.duckdns.org"   
APP_PORT="3000"                    

echo ">>> Installing NGINX..."
sudo apt-get update -y
sudo apt-get install -y nginx certbot python3-certbot-nginx cron

# ---- DuckDNS dynamic IP updater (only needed if using a *.duckdns.org domain) ----
echo ">>> Setting up DuckDNS updater..."
mkdir -p ~/duckdns
cat > ~/duckdns/duck.sh <<EOF
echo url="https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=" | curl -k -o ~/duckdns/duck.log -K -
EOF
chmod 700 ~/duckdns/duck.sh
( crontab -l 2>/dev/null; echo "*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1" ) | crontab -
~/duckdns/duck.sh

# ---- NGINX reverse proxy config ----
echo ">>> Writing NGINX site config for ${FULL_DOMAIN}..."
sudo tee /etc/nginx/sites-available/node-app > /dev/null <<EOF
server {
    listen 80;
    server_name ${FULL_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/node-app /etc/nginx/sites-enabled/node-app
sudo nginx -t
sudo systemctl restart nginx

echo ">>> Requesting Let's Encrypt SSL certificate..."
sudo certbot --nginx -d "${FULL_DOMAIN}" --non-interactive --agree-tos -m prachiptl2000@gmail.comm --redirect

echo ">>> Verifying auto-renewal..."
sudo certbot renew --dry-run

echo ""
echo "=========================================================="
echo "NGINX + SSL configured. App should be live at:"
echo "https://${FULL_DOMAIN}"
echo "=========================================================="
