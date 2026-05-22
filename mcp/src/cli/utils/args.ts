interface ParsedArgs {
  flags: Map<string, string | boolean>;
  positionals: string[];
}

export function parseArgs(args: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      flags.set(key, true);
      continue;
    }

    flags.set(key, next);
    index += 1;
  }

  return { flags, positionals };
}

export function stringFlag(flags: Map<string, string | boolean>, key: string): string | undefined {
  const value = flags.get(key);
  return typeof value === 'string' ? value : undefined;
}

export function numberFlag(flags: Map<string, string | boolean>, key: string, defaultValue: number | string): number {
  const value = Number(stringFlag(flags, key) ?? defaultValue);
  if (!Number.isFinite(value)) {
    throw new Error(`--${key} must be a finite number`);
  }
  return value;
}
