type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getCurrentLogLevel(): LogLevel {
  const env = process.env.LOG_LEVEL;
  if (env && env in LOG_LEVEL_PRIORITY) {
    return env as LogLevel;
  }
  return "info";
}

export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  correlation_id?: string;
  user_id?: string;
  instance?: string;
  event?: string;
  flow?: string;
  step?: string;
  duration_ms?: number;
  error?: string;
  [key: string]: unknown;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getCurrentLogLevel()];
}

function log(level: LogLevel, fields: Omit<LogEntry, "level" | "timestamp">) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "debug":
      console.debug(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  debug: (fields: Omit<LogEntry, "level" | "timestamp">) =>
    log("debug", fields),
  info: (fields: Omit<LogEntry, "level" | "timestamp">) =>
    log("info", fields),
  warn: (fields: Omit<LogEntry, "level" | "timestamp">) =>
    log("warn", fields),
  error: (fields: Omit<LogEntry, "level" | "timestamp">) =>
    log("error", fields),
};
