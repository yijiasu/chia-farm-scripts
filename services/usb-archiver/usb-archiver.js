const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { panic, loggerFactory } = require('../../utils');
const { setIntervalAsync } = require('set-interval-async/dynamic');
const sleep = require('await-sleep');
const { exec, execSync } = require('child_process');
const si = require('systeminformation');
const _ = require('lodash');
const udev = require("udev");

const defaultConfig = {
  plotSize: 108_100_000_000,
  plotNeedSize: 109_100_000_000,
  runLoopInterval: 30000,
};

const logger = loggerFactory('ARCHIVER');

function hasDir(watchDir) {
  const dirStat = fs.existsSync(watchDir) && fs.statSync(watchDir);
  return dirStat.isDirectory;
}
function getConfig() {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .help('h')
    .alias('h', 'help')
    .describe('watchdir', 'set which dir to watch')
    .describe('farmdir', 'set dest farm dir')
    .describe('print-disk-info', 'only print disk info and exit')
    .argv;

  const runConfig = {};

  if (!argv.watchdir) {
    panic('watchdir is not defined.');
  }

  if (!argv.farmdir) {
    panic('farmdir is not defined.');
  }

  if (!hasDir(argv.watchdir)) {
    panic('watchdir is not a directory or not existed');
  }

  if (!hasDir(argv.farmdir)) {
    panic('dest is not a directory or not existed');
  }

  runConfig.watchDir = argv.watchdir;
  runConfig.farmDir = argv.farmdir;
  
  if (argv['print-disk-info']) {
    runConfig.dryRun = true;
    runConfig.printDiskInfo = true;
  }
  else if (argv['print-usb-info']) {
    runConfig.dryRun = true;
    runConfig.printUsbInfo = true;
  }
  else if (argv['print-udev-info']) {
    runConfig.dryRun = true;
    runConfig.printUdevInfo = true;
  }
  else if (argv['print-disk-usb-assign']) {
    runConfig.dryRun = true;
    runConfig.printDiskUsbAssign = true;
  }

  return { ...defaultConfig, ...runConfig };
}

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
    const devPathChunks = devPath.split('/');
    const usbBusId = devPathChunks[5];
    return { ...dev, USB_BUS: usbBusId };
  }).map(dev => {
    const toFindHub = _.find(usbHubInfo, { bus: Number(dev['USB_BUS'].replace('usb', '')) });
    return { ...dev, IS_USB3: toFindHub ? toFindHub.name.includes('3.0') : false };
  })

  return udevList;

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

function mergePartAndSpace(parts, spaces) {
  return _.map(parts, part => {
    const fsInfo = _.find(spaces, { mount: part.mount });
    return {...part, ...fsInfo};
  });
}

function archiveFileSync({ fileFullPath, destPath }) {
  try {
    execSync(`rsync -aP --remove-source-files ${fileFullPath} ${destPath}`, { stdio: 'inherit' });
    logger.info(`Successfully archive`);
  } catch (error) {
    console.error(error);
    logger.info(`Last exitcode: ${error.status}`);
  }

}

async function archiveFile({ fileFullPath, destPath }) {
  return new Promise((resolve, reject) => {

    const cmd = `rsync -aP --remove-source-files ${fileFullPath} ${destPath}`;
    const proc = exec(cmd, (error, stdout, stderr) => {
      if (!error) {
        logger.info(`Successful archived: ${fileFullPath}`);
        resolve();
      } else {
        console.error(error);
        reject(new Error(`Upload: ${fileFullPath} exited with error`));
      }
    });

    proc.stdout.pipe(process.stdout);
    proc.stderr.pipe(process.stderr);
  });
}

async function selectDestPart({ farmDir, extraOpts }) {

  let parts = await getAllPartsInfo(farmDir);
  const spaces = await getAllFsInfo(farmDir);

  parts = mergePartAndSpace(parts, spaces);

  const fullParts = _(parts).filter(p => p.available < extraOpts.plotNeedSize).toArray().value();
  const availableParts = _(parts).filter(p => p.available > extraOpts.plotNeedSize).sortBy(['available', 'label']).toArray().value();

  logger.info(`TotalParts=${parts.length}; FullParts=${fullParts.length}; AvailableParts=${availableParts.length}`);
  if (availableParts.length === 0 ) {
    return;
  }
  logger.info(`First 5 Parts: \n${availableParts.slice(0, 5).map(p => `  -  ${p.mount} (${p.use})% `).join('\n')}`);

  
  return _.first(availableParts);

}

async function runLoop({ watchDir, farmDir, ...extraOpts }) {
  logger.info('Started Runloop...');
  if (!hasDir(watchDir)) {
    logger.warn('watchdir is not valid... skip this run');
    return;
  }

  const files = fs.readdirSync(watchDir);

  if (files.length === 0) {
    logger.info('watchdir is empty... skip this run');
    return;
  }

  for (const file of files) {
    const fileFullPath = path.join(watchDir, file);
    try {
      if (fileFullPath.endsWith('.plot')) {
        const fileStat = fs.statSync(fileFullPath);
        const fileSize = fileStat.size;
        const lastModTime = fileStat.mtime;

        // Check if the plot is big enough
        if (fileSize < extraOpts.plotSize) {
          logger.info(
            `Plot: ${file} is not ready. FileSize=${fileSize} Need=${extraOpts.plotSize}`
          );
          continue;
        }

        // Check if has not been written for a while
        const timeDiff = new Date() - new Date(lastModTime) / 1000;

        if (timeDiff < 45) {
          logger.info(
            `Plot: ${file} is not ready. Wait for file unchanged state. LastChgSec=${timeDiff} Need=45`
          );
          continue;
        }

        // Check if we have a part to write

        const selectedPart = await selectDestPart({ farmDir, extraOpts });

        if (!selectedPart) {
          logger.err('All parts are full! Skip this run');
          return;
        }

        logger.info(
          `Plot: ${file} is ready. Prepare to archive to ${selectedPart.mount}`
        );

        await archiveFile({
          fileFullPath,
          destPath: selectedPart.mount,
        });

        logger.info('Wait for 10 seconds');
        await sleep(10000);
      }
    } catch (error) {
      console.error(error);
    }
  }
}

async function main() {
  const runConfig = getConfig();
  console.log(runConfig);

  if (runConfig.dryRun) {

    if (runConfig.printDiskInfo) {

      const farmDir = runConfig.farmDir

      let parts = await getAllPartsInfo(farmDir);
      const spaces = await getAllFsInfo(farmDir);
    
      parts = mergePartAndSpace(parts, spaces);
    
      const fullParts = _(parts).filter(p => p.available < runConfig.plotNeedSize).toArray().value();
      const availableParts = _(parts)
        .filter(p => p.available > runConfig.plotNeedSize)
        .sortBy(['use', 'label'])
        .reverse()
        .toArray()
        .value();

      console.log('====Full Parts===');
      console.log(fullParts);

      console.log('====Available Parts===');
      console.log(availableParts);

      process.exit(0);
    }
    else if (runConfig.printUsbInfo) {

      console.log('Print USB Info')
      const usbInfo = await si.usb();
      console.log(usbInfo);
      process.exit(0);

    }
    else if (runConfig.printUdevInfo) {

      console.log('Print Udev Info')
      const udevInfo = await getUdevInfo();
      console.log(udevInfo);
      process.exit(0);

    }
    else if (runConfig.printDiskUsbAssign) {

      const assignInfo = await getDiskUsbAssign(runConfig.farmDir);
      const groupedInfo = _.groupBy(assignInfo, 'usbBus');

      for (const [usbBus, parts] of Object.entries(groupedInfo)) {
        console.log(`USB Host ${usbBus}  Devices=${parts.length}`);
        for (const part of parts) {
          console.log(`\t`.concat([
            part.isUsb3 ? '[*USB3]' : '[USB2]',
            part.mount,
            '\t',
            `${Math.round(part.size / (1024 ** 3))} GiB`,
            '\t',
            `/dev/${part.name}`
          ].join(' ')))
        }
      }
      process.exit(0);

    }


  }

  setIntervalAsync(runLoop, runConfig.runLoopInterval, runConfig);

}

main();
