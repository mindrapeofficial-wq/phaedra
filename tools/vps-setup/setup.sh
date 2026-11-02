#!/bin/bash
mkdir -p ~/.ssh
curl -sL https://raw.githubusercontent.com/mindrapeofficial-wq/phaedra/main/tools/vps-setup/key.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
echo "SSH key added OK"
