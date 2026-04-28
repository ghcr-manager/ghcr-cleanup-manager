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
      values.push(args[index + 1] as string);
    }
  }
  return values;
}

export function resolveGitHubToken(args: string[]): string {
  const cliToken = findOption(args, "--token");
  if (cliToken) {
    return cliToken;
  }

  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) {
    return envToken;
  }

  throw new Error("missing GitHub token: pass --token or set GITHUB_TOKEN");
}

export function resolveOptionalGitHubToken(args: string[]): string | undefined {
  const cliToken = findOption(args, "--token");
  if (cliToken) {
    return cliToken;
  }

  return process.env.GITHUB_TOKEN;
}
