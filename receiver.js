const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { panic, logger } = require('./utils');
const { setIntervalAsync } = require('set-interval-async/dynamic');
const sleep = require('await-sleep');
const { exec, execSync } = require('child_process');
const si = require('systeminformation');

// const PLOT_SIZE = 108_100_000_000;
const PLOT_SIZE = 108_100;

function hasDir(watchDir) {
  const dirStat = fs.existsSync(watchDir) && fs.statSync(watchDir);
  return dirStat.isDirectory;
}
function getConfig() {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .help('h')
    .alias('h', 'help')
    .describe('port', 'set port')
    .describe('dest', 'set dest temp dir')
    .alias('d', 'dest').argv;

  const runConfig = {};

  if (!argv.port) {
    panic('port is not defined.');
  }

  if (!argv.dest) {
    panic('dest is not defined.');
  }

  if (!hasDir(argv.dest)) {
    panic('watchdir is not a directory or not existed');
  }

  runConfig.port = argv.port;
  runConfig.destDir = argv.dest;

  return runConfig;
}


function runLoop({ port, destDir }) {
  while (true) {
    try {
      const exitCode = execSync(`nc -p ${port} -l | tar -x`, { cwd: destDir });
      logger.info(`Successfully exited. Re-run netcat`);
    } catch (error) {
      logger.info(`Last exitcode: ${error.status}`);
    }
  }
}

// async function getDiskInfo() {
//   const blk = await si.blockDevices();
//   console.log(blk);
// }

function main() {
  const runConfig = getConfig();
  console.log(runConfig);

  runLoop(runConfig);
  // setIntervalAsync(runLoop, 2500, runConfig);
}

main();
