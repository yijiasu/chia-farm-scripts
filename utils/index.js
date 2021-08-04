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

const logger = {
  warn: msg => console.error(`[${getFormattedDate()}] WARN: ${msg}`),
  err: msg => console.error(`[${getFormattedDate()}] ERR: ${msg}`),
  info: msg => console.log(`[${getFormattedDate()}] INFO: ${msg}`),
};

function panic(errMsg) {
  logger.err(errMsg);
  process.exit(-1);
}

module.exports = { panic, logger };
