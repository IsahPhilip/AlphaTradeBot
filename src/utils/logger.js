'use strict';

function log(level, message, meta) {
  const base = {
    level,
    message,
    timestamp: new Date().toISOString()
  };

  if (meta) {
    base.meta = meta;
  }

  const output = JSON.stringify(base);

  if (level === 'error') {
    console.error(output);
  } else {
    console.log(output);
  }
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
  debug: (message, meta) => log('debug', message, meta)
};
