/**
 * Agent Delegation Tools - Invoke external agent CLIs (Gemini, Claude, Codex)
 * Supports handoff file injection and automatic fallback
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

import { getWorkspaceRoot, mcpJson, mcpText } from '../utils/utils.js';
import { commandExists, sanitizeOutput, validatePath } from '../core/security/index.js';

// Configurable timeout via environment variable (default: 5 minutes)
const AGENT_TIMEOUT = parseInt(process.env.KIT_AGENT_TIMEOUT || '300000', 10);

type AgentName = 'gemini' | 'claude' | 'codex';

interface AgentJob {
  agent: AgentName;
  process: ChildProcess;
  startedAt: Date;
  chunks: string[];
  logStream: fs.WriteStream;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const jobRegistry = new Map<string, AgentJob>();

const INSTALL_HINTS: Record<AgentName, string> = {
  gemini: 'Install Gemini CLI: https://github.com/google-gemini/gemini-cli',
  claude: 'Install Claude CLI: npm install -g @anthropic-ai/claude-code',
  codex: 'Install Codex CLI: npm install -g @openai/codex',
};

function agentArgs(agent: AgentName, prompt: string, workspaceRoot: string): string[] {
  switch (agent) {
    case 'gemini':
      return ['-y', '-p', prompt];
    case 'claude':
      return ['--dangerously-skip-permissions', '-p', prompt];
    case 'codex':
      return ['--ask-for-approval', 'never', '--sandbox', 'workspace-write', '--cd', workspaceRoot, 'exec', prompt];
  }
}

function taskSlug(task: string): string {
  return task
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-')
    .slice(0, 48);
}

function initAgentLog(
  workspaceRoot: string,
  slug: string,
  agent: string,
): { logPath: string; logStream: fs.WriteStream } {
  const logsDir = path.join(workspaceRoot, '.agent-kit', 'logs', 'agents');
  fs.mkdirSync(logsDir, { recursive: true });
  const now = new Date().toISOString();
  const logFile = path.join(logsDir, `delegate-${now}-${slug}.log`);
  const header = `Agent: ${agent}\nDate: ${now}\n${'─'.repeat(60)}\n\n`;
  fs.writeFileSync(logFile, header, 'utf-8');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.on('error', () => {});
  return { logPath: path.relative(workspaceRoot, logFile), logStream };
}

export function registerAgentTools(server: McpServer): void {
  server.tool(
    'kit_trigger_agent',
    '!Important: Trigger only when user explicitly asks to delegate a task to an external agent CLI (gemini, claude, or codex). The task can be a direct message or a path to a handoff file (.agent-kit/handoffs/feature-slug/plan.md).',
    {
      agent: z.enum(['gemini', 'claude', 'codex']).describe('The agent CLI to invoke: "gemini", "claude", or "codex"'),
      task: z
        .string()
        .describe('Task message or path to a handoff file (e.g., ".agent-kit/handoffs/feature-slug/plan.md")'),
    },
    async ({ agent, task }, extra) => {
      const workspaceRoot = getWorkspaceRoot();
      let job: AgentJob | undefined;
      let logPath: string | undefined;
      let killChild: (() => void) | undefined;

      try {
        // Resolve task: read file if path, otherwise use as-is
        let prompt = task;
        const resolvedTask = path.resolve(workspaceRoot, task);
        if (fs.existsSync(resolvedTask) && fs.statSync(resolvedTask).isFile()) {
          try {
            validatePath(task, workspaceRoot);
            prompt = fs.readFileSync(resolvedTask, 'utf-8');
          } catch (err) {
            return mcpText(`Error reading task file: ${err}`);
          }
        }

        if (!commandExists(agent)) {
          return mcpJson({
            agent,
            status: 'error',
            output: '',
            error: `${agent} CLI is not installed. ${INSTALL_HINTS[agent]}`,
          });
        }

        // Gemini: -y (--yolo) for auto-accept, -p for headless prompt
        // Claude: --dangerously-skip-permissions for auto-accept, -p/--print for headless
        // Codex: exec for headless prompt, never ask for approval, workspace-write sandbox
        const args = agentArgs(agent, prompt, workspaceRoot);

        const { logPath: lp, logStream } = initAgentLog(workspaceRoot, taskSlug(task), agent);
        logPath = lp;

        const jobId = randomUUID();
        // detached=true on Unix creates a new process group so we can kill the
        // entire tree (CLI + its sub-agents) with process.kill(-pid, signal).
        const child = spawn(agent, args, {
          cwd: workspaceRoot,
          env: {
            ...process.env,
            CODEX_PROJECT_DIR: workspaceRoot,
            CODEX_WORKSPACE: workspaceRoot,
            GEMINI_WORKSPACE: workspaceRoot,
          },
          detached: process.platform !== 'win32',
        });

        const killTree = (sig: NodeJS.Signals) => {
          if (process.platform !== 'win32' && child.pid) {
            try {
              process.kill(-child.pid, sig);
            } catch {
              child.kill(sig);
            }
          } else {
            child.kill(sig);
          }
        };

        job = {
          agent,
          process: child,
          startedAt: new Date(),
          chunks: [],
          logStream,
          timeoutHandle: setTimeout(() => killTree('SIGTERM'), AGENT_TIMEOUT),
        };
        jobRegistry.set(jobId, job);

        // Kill child if the MCP request is cancelled (e.g. user presses ESC)
        killChild = () => {
          killTree('SIGTERM');
          setTimeout(() => killTree('SIGKILL'), 5000).unref();
        };
        if (extra.signal.aborted) killChild();
        else extra.signal.addEventListener('abort', killChild);

        await new Promise<void>((resolve, reject) => {
          child.stdout?.on('data', (data) => {
            job!.chunks.push(data.toString());
            job!.logStream.write(data);
          });
          child.stderr?.on('data', (data) => {
            job!.chunks.push(data.toString());
            job!.logStream.write(data);
          });
          child.on('close', (code, signal) => {
            if (code === 0) resolve();
            else reject(new Error(`Process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`));
          });
          child.on('error', reject);
        });

        return mcpJson({
          agent,
          status: 'success',
          log: logPath,
          output: sanitizeOutput(job.chunks.join('')),
        });
      } catch (error) {
        if (extra.signal.aborted) {
          return mcpJson({
            agent,
            status: 'cancelled',
            log: logPath,
            output: sanitizeOutput(job?.chunks.join('') ?? ''),
          });
        }
        const msg = error instanceof Error ? error.message : String(error);
        return mcpJson({ agent, status: 'error', output: '', error: msg });
      } finally {
        if (killChild) extra.signal.removeEventListener('abort', killChild);
        job?.logStream.end();
        if (job) clearTimeout(job.timeoutHandle);
      }
    },
  );
}
