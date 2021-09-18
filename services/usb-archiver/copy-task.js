const { panic, loggerFactory } = require('../../utils');
const _ = require('lodash');
const { mergePartAndSpace, getAllPartsInfo, getAllFsInfo, getUdevInfo, getDiskUsbAssign } = require('./misc');
const { exec } = require('child_process');
const { accessSync, constants } = require('fs');
const logger = loggerFactory('ARCHIVER_CTM');

class CopyTaskManager {

  constructor(runConfig) {
    this.taskId = 1;
    this.tasks = new Map();
    this.runConfig = runConfig;
    this.diskMapping= {};
    this.updateDiskMapping();
    this.startReport();
  }

  startReport() {
    setInterval(() => {
      if (this.tasks.size === 0) return;
      console.log(this.getReport());
    }, 5000);
  }

  updateDiskMapping() {
    getDiskUsbAssign(this.runConfig.farmDir).then(assignInfo => {
      this.diskMapping = _.groupBy(_.filter(assignInfo, { isUsb3: true }), 'usbBus');
    });
  }
  
  async getWriteDest() {
    const allUsb3Hosts = Object.keys(this.diskMapping);
    const occupiedHosts = Array.from(this.tasks.values()).map(e => e.usbBus);
    const leftOverHosts = _.difference(allUsb3Hosts, occupiedHosts);

    console.log('allUsb3Hosts', allUsb3Hosts);
    console.log('occupiedHosts', occupiedHosts);
    if (leftOverHosts.length === 0) {
      return undefined;
    }

    let writeDest, usbBus;

    for (const host of leftOverHosts) {
      let parts = this.diskMapping[host];
      const spaces = await getAllFsInfo(this.runConfig.farmDir);
      parts = mergePartAndSpace(parts, spaces);

      const fullParts = _(parts).filter(p => p.available < this.runConfig.plotNeedSize).toArray().value();
      const availableParts = _(parts).filter(p => p.available > this.runConfig.plotNeedSize).sortBy(['available', 'label']).toArray().value();
    
      logger.info(`UsbHost: ${host} TotalParts=${parts.length}; FullParts=${fullParts.length}; AvailableParts=${availableParts.length}`);
      if (availableParts.length === 0 ) {
        continue;
      }
      else {
        logger.info(`First 5 Parts: \n${availableParts.slice(0, 5).map(p => `  -  ${p.mount} (${p.use})% `).join('\n')}`);
        let writeDest;
        while (availableParts.length !== 0 && writeDest === undefined) {
          writeDest = availableParts.shift();
          if (writeDest) {
            writeDest = writeDest.mount;
            // check writeable
            try {
              accessSync(writeDest, constants.W_OK);
              break;
            } catch (error) {
              logger.warn(`${writeDest} is not writable. Skip`);
            }
          }
        }
        usbBus = host
        break;
      }
    }

    return { usbBus, writeDest };
  }

  async canHandleFile(fromPath) {
    logger.info(`Checking for handle: ${fromPath}`);
    if (!(await this.checkAvailable())) {
      logger.info('No Available Disk');
      return false;
    }
    if (this.tasks.has(fromPath)) {
      logger.info('Already archiving');
      return false;
    }

    return true;
  }

  async checkAvailable() {
    const writeDestTuple = await this.getWriteDest();
    if (!writeDestTuple) {
      return false;
    }
    const { usbBus, writeDest } = writeDestTuple;
    return usbBus !== undefined && writeDest !== undefined;
  }

  async startTask(fromPath) {
    const taskId = this.taskId;
    const { usbBus, writeDest } = await this.getWriteDest();

    const task = new CopyTask({ taskId, fromPath, toPath: writeDest, usbBus }, (err, task) => {
      if (!err) {
        this.onTaskFailed(task, err);
      }
      else {
        this.onTaskFinish(task);
      }
    });

    this.tasks.set(fromPath, task);
    task.start();

    this.taskId++;
  }

  onTaskFinish(task) {
    console.log("Task is finished");
    this.tasks.delete(task.fromPath);
  }

  onTaskFailed(task, error) {
    console.error(error);
    this.tasks.delete(task.fromPath);
  }

  getReport() {
    let reportText = '';
    reportText += `Ongoing Tasks Count: ${this.tasks.size} \n`;

    for (const task of this.tasks.values()) {
      reportText += `   ${task.fromPath}  WriteTo=${task.toPath}\t${task.progress.percentage}\t${task.progress.speed}\n`;
    }

    return reportText;

  }

}


class CopyTask {

  constructor({ taskId, fromPath, toPath, usbBus }, callback) {

    if (!callback) {
      throw new Error('Cannot start a task without onFinishCallback');
    }

    this.taskId = taskId;
    this.fromPath = fromPath;
    this.toPath = toPath;
    this.usbBus = usbBus;

    this.progress = {
      writeBytes: '',
      percentage: '',
      speed: '',
      eta: ''
    };

    this.callback = callback;

  }

  start() {
    // const cmd = `rsync -aP --bwlimit=1000 --remove-source-files ${this.fromPath} ${this.toPath}`;
    logger.info(`Task started! \n   From=${this.fromPath}\n   To=${this.toPath}`);
    const cmd = `rsync -aP --remove-source-files ${this.fromPath} ${this.toPath}`;
    const proc = exec(cmd, (error, stdout, stderr) => {
      if (!error) {
        this.callback(null, this);
      } else {
        this.callback(error, this);
      }
    });
    proc.stdout.on('data', data => {
      const chunks = data.toString().split(' ').filter(e => (e !== '\r' && !!e));
      this.progress.writeBytes = chunks[0];
      this.progress.percentage = chunks[1];
      this.progress.speed = chunks[2];
      this.progress.eta = chunks[3];      
    });
  }
}

module.exports = { CopyTask, CopyTaskManager };