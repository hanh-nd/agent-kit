#!/usr/bin/env node
import { runAgentKitCli } from './cli/index.js';

try {
  const exitCode = await runAgentKitCli(process.argv.slice(2), process.env);
  process.exit(exitCode);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write('[agent-kit] CLI error: ' + message + '\n');
  process.exit(1);
}
