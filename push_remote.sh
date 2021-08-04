rsync -P -a \
--exclude 'node_modules' \
--exclude 'push_remote.sh' \
--exclude '.git' \
. plotter4@10.0.0.204:~/chia/chia-farm-scripts

rsync -P -a \
--exclude 'node_modules' \
--exclude 'push_remote.sh' \
--exclude '.git' \
. collector@10.0.0.100:~/chia-farm-scripts