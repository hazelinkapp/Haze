// ============================================================
//  utils/logger.js — Console logging wrapper for Hazel
// ============================================================

const { inspect } = require("util");

const LEVELS = {
  info:    { label: "INFO ",  color: "\x1b[36m"  }, // Cyan
  success: { label: "OK   ",  color: "\x1b[32m"  }, // Green
  warn:    { label: "WARN ",  color: "\x1b[33m"  }, // Yellow
  error:   { label: "ERROR",  color: "\x1b[31m"  }, // Red
  debug:   { label: "DEBUG",  color: "\x1b[35m"  }, // Magenta
};

const RESET = "\x1b[0m";
const GREY  = "\x1b[90m";
const BOLD  = "\x1b[1m";

function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function formatValue(val) {
  if (typeof val === "string") return val;
  return inspect(val, { depth: 4, colors: true });
}

function log(level, ...args) {
  const { label, color } = LEVELS[level] ?? LEVELS.info;
  const ts   = `${GREY}[${timestamp()}]${RESET}`;
  const lvl  = `${color}${BOLD}[${label}]${RESET}`;
  const body = args.map(formatValue).join(" ");
  console.log(`${ts} ${lvl} ${body}`);
}

const logger = {
  info:    (...args) => log("info",    ...args),
  success: (...args) => log("success", ...args),
  warn:    (...args) => log("warn",    ...args),
  error:   (...args) => log("error",   ...args),
  debug:   (...args) => {
    if (process.env.DEBUG === "true") log("debug", ...args);
  },
};

module.exports = logger;
