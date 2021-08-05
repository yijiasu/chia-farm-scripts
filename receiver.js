const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { panic, logger } = require('./utils');
const { setIntervalAsync } = require('set-interval-async/dynamic');
const sleep = require('await-sleep');
const { exec, execSync } = require('child_process');
const si = require('systeminformation');
const Koa = require('koa');
const os = require('os');

// const PLOT_SIZE = 108_100_000_000;
const PLOT_SIZE = 108_100;
const httpApp = new Koa();
let lastUsedPort = 13000;

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

function launchNetCat({ port, destDir }) {
  return new Promise((resolve, reject) => {
    const isMac = os.type() === 'Darwin';
    const cmd = isMac ? `nc -l ${port} | tar -x` : `nc -p ${port} -l | tar -x`
    const proc = exec(cmd, { cwd: destDir }, (error, stdout, stderr) => {
      if (!error) {
        logger.info(`Netcat Successfully exited`);
        resolve();
      } else {
        console.error(error);
        reject(new Error(`Netcat: Exited with error`));
      }
    });
  });
}
function setupHttp(runConfig) {
  httpApp.use(async ctx => {

    if (ctx.method !== 'POST') {
      ctx.body = 'GET Request not allowed';
      ctx.status = 400;
      return;
    }

    // Get Random Port
    lastUsedPort++;
    if (lastUsedPort >= 13100) {
      lastUsedPort = 13000;
    }

    const ncPort = lastUsedPort;
    logger.info(`Assign Port: ${ncPort}`);

    launchNetCat({ port: ncPort, destDir: runConfig.destDir })
      .then(() => {
        logger.info(`Netcat exited successfully. Port: ${ncPort}`);
      })
      .catch(error => {
        console.error(error);
      });

    // Wait 2 second to allow nc launch

    await sleep(2000);

    ctx.body = {
      port: ncPort,
    };
  });

  httpApp.listen(runConfig.port);
}
function main() {
  const runConfig = getConfig();
  console.log(runConfig);

  setupHttp(runConfig);
}

main();
