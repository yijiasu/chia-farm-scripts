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

const logger = loggerFactory('MOUNT');

function isRoot() {
  return process.getuid() === 0
}
function getConfig() {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .help('h')
    .alias('h', 'help')
    .describe('mountdir', 'set which dir to mount')
    .describe('scandir', 'set which dir to scan')
    .describe('readonly', 'mount as readonly')
    .describe('umount', 'run as umount')
    .argv;

  const runConfig = {};

  if (!argv.mountdir) {
    panic('mountdir is not defined.');
  }

  if (!argv.scandir) {
    panic('scandir is not defined.');
  }

  runConfig.mountDir = argv.mountdir;
  runConfig.scanDir = argv.scandir;
  runConfig.readOnly = !!argv.readonly;
  runConfig.umount = !!argv.umount;

  return { ...runConfig };
}

async function mountAll(runConfig, toMountDisks) {
  const isReadOnly = runConfig.readOnly;
  const dfOutput = execSync('df').toString();

  const mountedPath = dfOutput.split('\n').slice(1).map(e => _.last(e.split(' ')));

  const needMountDisks = toMountDisks.filter(md => !mountedPath.includes(path.join(runConfig.mountDir, md)));

  logger.info(`Excluded mounted disk, need to mount: ${needMountDisks.length} disks`);
  for (const md of needMountDisks) {
    // Check if dir exist
    if (!fs.existsSync(path.join(runConfig.mountDir, md))) {
      fs.mkdirSync(path.join(runConfig.mountDir, md));
    }
    const devPath = path.join(runConfig.scanDir, md);
    const mntPath = path.join(runConfig.mountDir, md);
    
    try {
      execSync(`mount ${isReadOnly ? "-o ro" : ''} ${devPath} ${mntPath}`);
      execSync(`chown -R $(whoami):$(whoami) ${mntPath}`);
      
      logger.info(`Mounted: ${md} to ${path.join(runConfig.mountDir, md)}`);
    } catch (error) {
      logger.err(error.message);
    }

    await sleep(200);
  }
}


async function unmountAll(runConfig, toMountDisks) {
  for (const md of toMountDisks) {
    const mntPath = path.join(runConfig.mountDir, md);
    
    try {
      execSync(`umount -l ${mntPath}`);
      logger.info(`Unmounted: ${md}`);
    } catch (error) {
      logger.err(error.message);
    }

    await sleep(200);
  }
}

async function main() {
  const runConfig = getConfig();
  
  console.log(runConfig);

  if (!isRoot()) {
    panic("need to run under root");
  }

  const toMountDisks = fs.readdirSync(runConfig.scanDir);
  if (!toMountDisks || toMountDisks.length === 0) {
    panic("No disks are found");
  }

  logger.info(`Found: ${toMountDisks.length} disks to mount`);

  if (!runConfig.umount) {
    await mountAll(runConfig, toMountDisks);
  }
  else {
    await unmountAll(runConfig, toMountDisks);
  }

}

main();
