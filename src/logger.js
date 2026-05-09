const fs   = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logFile = path.join(logsDir, "requests.log");

let chalk;
try {
  chalk = require("chalk");
} catch {
  const id = (s) => s;
  chalk = {
    green: id, yellow: id, red: id, cyan: id,
    blue: id, magenta: id, gray: id, bold: { white: id }
  };
}

const LEVEL_COLOR = {
  INFO:    chalk.cyan,
  WARN:    chalk.yellow,
  ERROR:   chalk.red,
  ROUTE:   chalk.green,
  HEALTH:  chalk.magenta,
  RATE:    chalk.yellow,
  METRICS: chalk.blue,
};

function timestamp() {
  return new Date().toISOString();
}

function write(level, message, meta = {}) {
  const ts       = timestamp();
  const colorFn  = LEVEL_COLOR[level] || ((s) => s);
  const metaStr  = Object.keys(meta).length
    ? "  " + JSON.stringify(meta)
    : "";

  console.log(
    chalk.gray(`[${ts}]`) +
    " " +
    colorFn(`[${level}]`) +
    " " +
    message +
    chalk.gray(metaStr)
  );

  const line = JSON.stringify({ ts, level, message, ...meta }) + "\n";
  fs.appendFile(logFile, line, () => {});
}

const logger = {
  info:    (msg, meta) => write("INFO",    msg, meta),
  warn:    (msg, meta) => write("WARN",    msg, meta),
  error:   (msg, meta) => write("ERROR",   msg, meta),
  route:   (msg, meta) => write("ROUTE",   msg, meta),
  health:  (msg, meta) => write("HEALTH",  msg, meta),
  rate:    (msg, meta) => write("RATE",    msg, meta),
  metrics: (msg, meta) => write("METRICS", msg, meta),
};

module.exports = logger;
