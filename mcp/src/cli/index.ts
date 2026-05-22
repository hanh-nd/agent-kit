import { runMemoryCli } from './memory.js';

export async function runAgentKitCli(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const [command, ...rest] = argv;
  if (command === 'memory') {
    return runMemoryCli(rest, env);
  }

  process.stderr.write('Usage: agent-kit-cli memory <digest-file|digest-init|digest-pending>\n');
  return 1;
}
