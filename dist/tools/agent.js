/**
 * Agent Delegation Tools - Invoke external agent CLIs (Gemini, Claude)
 * Supports handoff file injection and automatic fallback
 */
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { getWorkspaceRoot } from '../utils.js';
import { commandExists, validatePath } from './security.js';
// Configurable timeout via environment variable (default: 5 minutes)
const AGENT_TIMEOUT = parseInt(process.env.KIT_AGENT_TIMEOUT || '300000', 10);
const jobRegistry = new Map();
/**
 * Generate a URL-safe slug from a task string (first ~6 words, max 48 chars)
 */
function taskSlug(task) {
    return task
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 6)
        .join('-')
        .slice(0, 48);
}
/**
 * Initialize a live-streaming log file for an agent job.
 * Writes the header synchronously so the file exists immediately,
 * then opens an append-mode WriteStream for real-time chunk writing.
 */
function initAgentLog(workspaceRoot, slug, agent) {
    const logsDir = path.join(workspaceRoot, '.agent-kit', 'logs', 'agents');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, `delegate-${slug}.log`);
    const header = `Agent: ${agent}\nDate: ${new Date().toISOString()}\n${'─'.repeat(60)}\n\n`;
    fs.writeFileSync(logFile, header, 'utf-8');
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });
    logStream.on('error', () => { });
    return { logPath: path.relative(workspaceRoot, logFile), logStream };
}
/**
 * Register agent delegation tools with MCP server
 */
export function registerAgentTools(server) {
    // ═══════════════════════════════════════════════════════════════
    // TOOL: TRIGGER AGENT
    // Delegates a task to an external agent CLI (gemini or claude).
    // Auto-detects if task is a file path and reads it as context.
    // Falls back to the alternate agent if requested one is missing.
    // ═══════════════════════════════════════════════════════════════
    server.tool('kit_trigger_agent', 'Delegate a task to an external agent CLI (gemini or claude). The task can be a direct message or a path to a handoff file (.agent-kit/handoffs/plans/plan-xyz.md). Falls back to the other agent CLI if the requested one is not installed.', {
        agent: z.enum(['gemini', 'claude']).describe('The agent CLI to invoke: "gemini" or "claude"'),
        task: z
            .string()
            .describe('Task message or path to a handoff file (e.g., ".agent-kit/handoffs/plans/plan-xyz.md")'),
    }, async ({ agent, task }) => {
        try {
            const workspaceRoot = getWorkspaceRoot();
            // Detect if task is a file path — resolve and read if it exists
            let prompt = task;
            const resolvedTask = path.resolve(workspaceRoot, task);
            if (fs.existsSync(resolvedTask) && fs.statSync(resolvedTask).isFile()) {
                try {
                    validatePath(task, workspaceRoot);
                    prompt = fs.readFileSync(resolvedTask, 'utf-8');
                }
                catch (err) {
                    return {
                        content: [{ type: 'text', text: `Error reading task file: ${err}` }],
                    };
                }
            }
            // Determine which agent to use — fallback if requested not available
            let usedAgent = agent;
            let fallbackReason;
            if (!commandExists(agent)) {
                const fallback = agent === 'gemini' ? 'claude' : 'gemini';
                if (commandExists(fallback)) {
                    usedAgent = fallback;
                    fallbackReason = `${agent} CLI not installed, fell back to ${fallback}`;
                }
                else {
                    const installHint = agent === 'gemini'
                        ? 'Install Gemini CLI: https://github.com/google-gemini/gemini-cli'
                        : 'Install Claude CLI: npm install -g @anthropic-ai/claude-code';
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    agent,
                                    status: 'error',
                                    output: '',
                                    error: `Neither ${agent} nor the fallback agent CLI is installed. ${installHint}`,
                                }, null, 2),
                            },
                        ],
                    };
                }
            }
            // Execute the agent CLI with the prompt
            // Gemini: -y (--yolo) for auto-accept, -p for headless prompt
            // Claude: --dangerously-skip-permissions for auto-accept, -p/--print for headless
            const agentArgs = usedAgent === 'gemini'
                ? ['-y', '-p', prompt]
                : ['--dangerously-skip-permissions', '-p', prompt];
            const slug = taskSlug(task);
            const { logPath, logStream } = initAgentLog(workspaceRoot, slug, usedAgent);
            const jobId = randomUUID();
            const child = spawn(usedAgent, agentArgs, {
                cwd: workspaceRoot,
                env: { ...process.env, GEMINI_WORKSPACE: workspaceRoot },
            });
            const job = {
                id: jobId,
                agent: usedAgent,
                process: child,
                startedAt: new Date(),
                chunks: [],
                logStream,
                timeoutHandle: setTimeout(() => {
                    child.kill('SIGTERM');
                }, AGENT_TIMEOUT),
            };
            jobRegistry.set(jobId, job);
            try {
                await new Promise((resolve, reject) => {
                    child.stdout?.on('data', (data) => {
                        job.chunks.push(data.toString());
                        job.logStream.write(data);
                    });
                    child.stderr?.on('data', (data) => {
                        job.chunks.push(data.toString());
                        job.logStream.write(data);
                    });
                    child.on('close', (code) => {
                        if (code === 0)
                            resolve();
                        else
                            reject(new Error(`Process exited with code ${code}`));
                    });
                    child.on('error', reject);
                });
                const output = job.chunks.join('');
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                agent: usedAgent,
                                status: fallbackReason ? 'fallback' : 'success',
                                log: logPath,
                                output,
                                ...(fallbackReason && { fallback_reason: fallbackReason }),
                            }, null, 2),
                        },
                    ],
                };
            }
            catch (error) {
                throw error;
            }
            finally {
                job.logStream.end();
                clearTimeout(job.timeoutHandle);
                jobRegistry.delete(jobId);
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            agent,
                            status: 'error',
                            output: '',
                            error: msg,
                        }, null, 2),
                    },
                ],
            };
        }
    });
}
