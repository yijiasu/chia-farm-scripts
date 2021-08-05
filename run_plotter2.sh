#!/bin/bash
screen -dmS plot bash -c 'cd ~/chia/chia-blockchain; . ./activate; plotman interactive; exec bash'
screen -dmS uploader bash -c 'cd ~/chia/chia-farm-scripts/; node uploader.js --watchdir /mnt/TmpDrive/ --host 10.0.0.100 --port 3001; exec bash'