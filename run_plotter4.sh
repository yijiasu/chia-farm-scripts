#!/bin/bash
screen -dmS plot bash -c 'cd ~/chia/scripts/; ./plot.sh; exec bash'
screen -dmS uploader bash -c 'cd ~/chia/chia-farm-scripts/; node uploader.js -w /mnt/Plot1T/out/ --host 10.0.0.100 --port 3001; exec bash'
