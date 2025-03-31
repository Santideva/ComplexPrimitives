// File: src/utils/logger.js

export const logger = {
    info(message) {
      console.info(`[INFO] ${message}`);
    },
    debug(message) {
      console.debug(`[DEBUG] ${message}`);
    },
    error(message) {
      console.error(`[ERROR] ${message}`);
    }
  };
  