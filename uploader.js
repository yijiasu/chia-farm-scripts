const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { panic, logger } = require('./utils');
const { setIntervalAsync } = require('set-interval-async/dynamic');
const sleep = require('await-sleep');
const { exec } = require('child_process');

const defaultConfig = {
  plotSize: 108_100_000_000,
  runLoopInterval: 15000,
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
    .alias('w', 'watchdir')
    .describe('keepfile', 'keep file after upload').boolean('keepfile')
    .describe('host', 'set remote host')
    .describe('port', 'set remote port').argv;

  const runConfig = {};

  if (!argv.watchdir) {
    panic('watchdir is not defined.');
  }

  if (!argv.host || !argv.port) {
    panic('host/port is not defined.');
  }

  if (!hasDir(argv.watchdir)) {
    panic('watchdir is not a directory or not existed');
  }

  runConfig.watchDir = argv.watchdir;
  runConfig.remoteHost = argv.host;
  runConfig.remotePort = argv.port;
  runConfig.keepFile = !!argv.keepfile;

  return { ...defaultConfig, ...runConfig };
}

async function uploadFile({ cwd, fileName, fileSize, remoteHost, remotePort }) {
  // tar -c *.plot | pv | nc 10.0.0.100 3000
  // console.log(`tar -c ${fileName} | nc ${remoteHost} ${remotePort}`, { cwd });
  return new Promise((resolve, reject) => {
    // const uploadProc = exec(`./upload.sh ${cwd} ${fileName} ${remoteHost} ${remotePort}`);
    // const proc = exec(`./upload.sh ${cwd} ${fileName} ${remoteHost} ${remotePort}`, (error, stdout, stderr) => {

    const cmd = `cd ${cwd} && tar cf - ${fileName} | pv -c --force --size ${fileSize} | nc ${remoteHost} ${remotePort}`;
    // console.log(cmd);
    const proc = exec(cmd, (error, stdout, stderr) => {
      if (!error) {
        logger.info(`Successful uploaded: ${fileName}`);
        resolve();
      } else {
        console.error(error);
        reject(new Error(`Upload: ${fileName} exited with error`));
      }
    });

    proc.stdout.pipe(process.stdout);
    proc.stderr.pipe(process.stderr);
  });
}

async function runLoop({ watchDir, keepFile, plotSize, ...extraOpts }) {
  logger.info('Started Runloop...');
  if (!hasDir(watchDir)) {
    logger.warn('watchdir is not valid... skip this run');
    return;
  }

  const files = fs.readdirSync(watchDir);
  for (const file of files) {
    const fileFullPath = path.join(watchDir, file);
    // console.log(fileFullPath);
    if (fileFullPath.endsWith('.plot')) {
      const fileSize = fs.statSync(fileFullPath).size;
      // console.log(`${fileFullPath} => ${fileSize}`);
      if (fileSize > plotSize) {
        logger.info(`Plot: ${file} is ready. Prepare to upload`);
        try {
          await uploadFile({
            cwd: watchDir,
            fileSize,
            fileName: file,
            ...extraOpts,
          });
          logger.info('Wait for 10 seconds');
          await sleep(10000);
          if (!keepFile) {
            logger.info(`Remove file: ${file} and wait 5 seconds`);
            await fs.promises.unlink(fileFullPath);
            await sleep(5000);  
          }  
        } catch (error) {
          console.error(error)
        }
      }
    }
  }
}

function main() {
  const runConfig = getConfig();
  console.log(runConfig);
  setIntervalAsync(runLoop, runConfig.runLoopInterval, runConfig);
}

main();
