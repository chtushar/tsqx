const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";

const BG_RED = "\x1b[41m";

const PREFIX = `${CYAN}${BOLD}tsqx${RESET}`;

function timestamp(): string {
  return `${DIM}${new Date().toLocaleTimeString()}${RESET}`;
}

export const logger = {
  info(message: string, ...args: unknown[]) {
    console.log(`${timestamp()} ${PREFIX} ${BLUE}ℹ${RESET} ${message}`, ...args);
  },

  success(message: string, ...args: unknown[]) {
    console.log(`${timestamp()} ${PREFIX} ${GREEN}✔${RESET} ${message}`, ...args);
  },

  warn(message: string, ...args: unknown[]) {
    console.warn(`${timestamp()} ${PREFIX} ${YELLOW}⚠${RESET} ${YELLOW}${message}${RESET}`, ...args);
  },

  error(message: string, ...args: unknown[]) {
    console.error(`${timestamp()} ${PREFIX} ${BG_RED}${BOLD} ERROR ${RESET} ${RED}${message}${RESET}`, ...args);
  },

  debug(message: string, ...args: unknown[]) {
    if (process.env.DEBUG) {
      console.debug(`${timestamp()} ${PREFIX} ${DIM}⬡ ${message}${RESET}`, ...args);
    }
  },

  step(message: string, ...args: unknown[]) {
    console.log(`${timestamp()} ${PREFIX} ${DIM}→${RESET} ${message}`, ...args);
  },
};
