export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const createLogger = (debug = false): Logger => ({
  debug(message) {
    if (debug) console.error(`[debug] ${message}`);
  },
  info(message) {
    console.log(message);
  },
  warn(message) {
    console.error(`[warn] ${message}`);
  },
  error(message) {
    console.error(message);
  },
});

