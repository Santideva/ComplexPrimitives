// File: src/utils/logger.js

export const logger = {
    info(message) {
      console.info(`[INFO] ${message}`);
    },
    debug(message) {
      console.debug(`[DEBUG] ${message}`);
    },
    warn(message) {
      console.warn(`[WARN] ${message}`);
    },
    error(message) {
      console.error(`[ERROR] ${message}`);
    }
  };
  