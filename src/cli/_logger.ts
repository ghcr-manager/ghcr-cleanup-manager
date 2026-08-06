export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  trace: (message: string) => void;
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

const _logLevelPriority: Record<LogLevel, number> = {
  trace: 0,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

export function isLogLevel(value: string): value is LogLevel {
  return value in _logLevelPriority;
}

export function createLogger(level: LogLevel, sink: NodeJS.WritableStream = process.stderr): Logger {
  return {
    trace: _write.bind(null, "trace", level, sink),
    debug: _write.bind(null, "debug", level, sink),
    info: _write.bind(null, "info", level, sink),
    warn: _write.bind(null, "warn", level, sink),
    error: _write.bind(null, "error", level, sink)
  };
}

function _write(level: LogLevel, threshold: LogLevel, sink: NodeJS.WritableStream, message: string): void {
  if (_logLevelPriority[level] < _logLevelPriority[threshold]) {
    return;
  }

  sink.write(`${new Date().toISOString()} ${level.toUpperCase()} ${message}\n`);
}
