const si = require('systeminformation');
const _ = require('lodash');
const udev = require("udev");


async function getAllPartsInfo(farmDir, addUsbInfo = false) {
  const diskInfo = await si.blockDevices();
  const validParts = _.filter(diskInfo, {
    type: 'part',
    fsType: 'ext4',
  }).filter(p => p.mount.startsWith(farmDir));

  if (addUsbInfo) {

  }
  return validParts;
}

async function getAllFsInfo(farmDir) {
  const fsInfo = await si.fsSize();
  const validFsInfo = fsInfo.filter(e => e.mount.startsWith(farmDir));
  return validFsInfo;
}

async function getUdevInfo() {

  const usbInfo = await si.usb();
  const usbHubInfo = _.filter(usbInfo, u => u.deviceId === 1);

  const udevList = _.filter(udev.list(), dev => {
    const isUSB = dev['DEVPATH'].indexOf('usb') !== -1;
    const isDiskType = dev['ID_TYPE'] === 'disk';
    const isPartition = dev['DEVTYPE'] === 'partition';
    const isExt4 = dev['ID_FS_TYPE'] === 'ext4';
    return isUSB && isDiskType && isPartition && isExt4;
  }).map(dev => {
    const devPath = dev['DEVPATH'];
    const usbBusId = devPath.match(/\/usb\d+\//)[0].replace(/\//g, '');
    return { ...dev, USB_BUS: usbBusId };
  }).map(dev => {
    const toFindHub = _.find(usbHubInfo, { bus: Number(dev['USB_BUS'].replace('usb', '')) });
    return { ...dev, IS_USB3: toFindHub ? toFindHub.name.includes('3.0') : false };
  })

  return udevList;

}

function mergePartAndSpace(parts, spaces) {
  return _.map(parts, part => {
    const fsInfo = _.find(spaces, { mount: part.mount });
    return {...part, ...fsInfo};
  });
}


async function getDiskUsbAssign(farmDir) {
  let partsInfo = await getAllPartsInfo(farmDir);
  const allUdevInfo = await getUdevInfo();
  partsInfo = partsInfo.map(pi => {
    const udevInfo = _.find(allUdevInfo, { ID_FS_LABEL: pi.label });
    return {
      ...pi,
      isUsb3: udevInfo['IS_USB3'],
      usbBus: udevInfo['USB_BUS'],
    };
  });
  return partsInfo;
}

module.exports = {
  mergePartAndSpace, getAllPartsInfo, getAllFsInfo, getUdevInfo, getDiskUsbAssign
}