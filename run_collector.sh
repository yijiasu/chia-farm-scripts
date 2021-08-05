#!/bin/bash
screen -dmS recv bash -c 'cd ~/chia-farm-scripts; node receiver.js --port 3001 --dest /mnt/TmpDrive; exec bash'
screen -dmS archiver bash -c 'cd ~/chia-farm-scripts; node archiver.js --watchdir /mnt/TmpDrive/ --farmdir /mnt/farm; exec bash'
screen -dmS chia bash -c 'cd ~/chia-blockchain; . ./activate; exec bash'