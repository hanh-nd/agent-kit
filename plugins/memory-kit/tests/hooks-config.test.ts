import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

const providers = ['.claude', '.codex', '.gemini'] as const;

function collectCommands(value: unknown, commands: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectCommands(item, commands);
    return commands;
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.command === 'string') commands.push(record.command);
    for (const nested of Object.values(record)) collectCommands(nested, commands);
  }

  return commands;
}

describe('Memory Kit provider hook configs', () => {
  for (const provider of providers) {
    test(`${provider} SessionStart digest hook runs in background mode`, () => {
      const hooksPath = path.join(process.cwd(), provider, 'hooks', 'hooks.json');
      const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8')) as unknown;
      const digestCommand = collectCommands(config).find((command) => command.includes('memory digest-pending'));

      assert.ok(digestCommand, `${provider} must configure memory digest-pending hook`);
      assert.match(digestCommand, /digest-pending --background/);
    });
  }
});
