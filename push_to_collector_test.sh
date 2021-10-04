rsync -P -a \
--exclude 'node_modules' \
--exclude 'push_to_collector_test.sh' \
--exclude '.git' \
. collector@192.168.2.105:~/chia-farm-scripts