rsync -P -a \
--exclude 'node_modules' \
--exclude 'push_to_collector_test.sh' \
--exclude '.git' \
. collector@10.0.0.100:~/chia-test/chia-farm-scripts