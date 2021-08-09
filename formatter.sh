#!/bin/bash

if [ "$EUID" -ne 0 ]
  then echo "Please run as root"
  exit
fi

parted --script $1 \
    mklabel gpt \
    mkpart primary ext4 0% 100% \
    name 1 $2
sleep 5
mkfs.ext4 -F -m 0 -T largefile4 -L $2 "${1}1"

uuid=$(blkid "${1}1" -s UUID -o value)

echo "/dev/disk/by-uuid/${uuid} /mnt/farm/${2} ext4 defaults 0 0" | tee --append /etc/fstab

mkdir -p "/mnt/farm/${2}"
cd /mnt/farm/
chown -R collector ${2}