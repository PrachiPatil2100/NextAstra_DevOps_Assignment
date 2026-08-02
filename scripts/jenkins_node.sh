#!/bin/bash

set -e

echo "=========================================================="
echo "Installing Jenkins, Java 21, and Node.js..."
echo "=========================================================="

echo ">>> Updating package index..."
sudo apt update -y

echo ">>> Installing prerequisites..."
sudo apt install -y fontconfig openjdk-21-jre curl wget

echo ">>> Verifying Java installation..."
java -version

echo ">>> Creating apt keyrings directory..."
sudo mkdir -p /etc/apt/keyrings

echo ">>> Adding Jenkins repository key..."
sudo wget -O /etc/apt/keyrings/jenkins-keyring.asc \
    https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key

echo ">>> Adding Jenkins repository..."
echo "deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" | \
    sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null

echo ">>> Updating package index..."
sudo apt update -y

echo ">>> Installing Jenkins..."
sudo apt install -y jenkins

echo ">>> Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo ">>> Verifying Node.js installation..."
node -v
npm -v

echo ">>> Enabling Jenkins service..."
sudo systemctl enable jenkins

echo ">>> Starting Jenkins..."
sudo systemctl start jenkins

echo ">>> Jenkins service status..."
sudo systemctl --no-pager status jenkins

echo ""
echo "=========================================================="
echo "Jenkins installation completed successfully!"
echo ""
echo "Access Jenkins at:"
echo "http://<SERVER-IP>:8080"
echo ""
echo "Initial Admin Password:"
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
echo ""
echo "=========================================================="
