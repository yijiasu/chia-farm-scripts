const getFormattedDate = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  const dateLocal = new Date(now.getTime() - offsetMs);
  const str = dateLocal
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  return str;
}

function loggerFactory (loggerName) {
  const logger = {
    warn: msg => console.error(`[${getFormattedDate()}] ${loggerName} [WARN] ${msg}`),
    err: msg => console.error(`[${getFormattedDate()}] ${loggerName} [ERR] ${msg}`),
    info: msg => console.log(`[${getFormattedDate()}] ${loggerName} [INFO] ${msg}`),
  };
  
  return logger;
}

function panic(errMsg) {
  logger.err(errMsg);
  process.exit(-1);
}

module.exports = { panic, loggerFactory };
