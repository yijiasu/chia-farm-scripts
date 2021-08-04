rsync -P -a \
--exclude 'node_modules' \
--exclude 'push_remote.sh' \
--exclude '.git' \
. plotter2@10.0.0.202:~/chia/chia-farm-scripts