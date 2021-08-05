const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { panic, logger } = require('./utils');
const { setIntervalAsync } = require('set-interval-async/dynamic');
const sleep = require('await-sleep');
const { exec, execSync } = require('child_process');
const si = require('systeminformation');
const _ = require('lodash');

// const PLOT_SIZE = 108_100_000_000;
// const PLOT_NEED_SIZE = ;
// const PLOT_SIZE = 108_100;

const defaultConfig = {
  plotSize: 108_100_000_000,
  plotNeedSize: 109_100_000_000,
  runLoopInterval: 30000,
};

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

  return { ...defaultConfig, ...runConfig };
}

async function getAllPartsInfo(farmDir) {
  const diskInfo = await si.blockDevices();
  const validParts = _.filter(diskInfo, {
    type: 'part',
    fsType: 'ext4',
  }).filter(p => p.mount.startsWith(farmDir));
  return validParts;
}

async function getAllFsInfo(farmDir) {
  const fsInfo = await si.fsSize();
  const validFsInfo = fsInfo.filter(e => e.mount.startsWith(farmDir));
  return validFsInfo;
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

      const selectedPart = await selectDestPart({ farmDir, extraOpts })

      if (!selectedPart) {
        logger.err('All parts are full! Skip this run');
        return;
      }

      logger.info(`Plot: ${file} is ready. Prepare to archive to ${selectedPart.mount}`);

      await archiveFile({
        fileFullPath,
        destPath: selectedPart.mount,
      });

      logger.info('Wait for 10 seconds');
      await sleep(10000);
    }
  }
}

async function main() {
  const runConfig = getConfig();
  console.log(runConfig);

  setIntervalAsync(runLoop, runConfig.runLoopInterval, runConfig);
}

main();
