rsync -P -a \
--exclude 'node_modules' \
--exclude 'push_remote.sh' \
--exclude '.git' \
. ubuntu@vm2:~/chia/chia-farm-scripts
