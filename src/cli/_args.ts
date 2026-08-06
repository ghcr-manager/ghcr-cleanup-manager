import { isLogLevel, type LogLevel } from "./_logger.js";

export function requireOption(args: string[], name: string): string {
  const value = findOption(args, name);
  if (!value) {
    throw new Error(`missing required option: ${name}`);
  }

  return value;
}

export function findOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

export function collectRepeatedOption(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) {
      values.push(args[index + 1]);
    }
  }
  return values;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function resolveToken(args: string[]): string {
  const cliToken = findOption(args, "--token");
  if (cliToken) {
    return cliToken;
  }

  throw new Error("missing required option: --token");
}

export function resolveLogLevel(args: string[]): LogLevel {
  const rawLevel = findOption(args, "--log-level") ?? "info";
  if (!isLogLevel(rawLevel)) {
    throw new Error(`invalid log level: ${rawLevel}`);
  }

  return rawLevel;
}
