import { spawn } from 'child_process';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * Spawns a Node.js script as a detached background process.
 * Returns immediately — does not block the caller.
 *
 * @param {string | URL} scriptUrl - import.meta.url-relative URL or absolute path to the script
 * @param {string[]} [args] - optional CLI arguments passed to the script
 */
/**
 * Runs `fn` only when this module is the direct entry point (i.e. invoked via CLI).
 * Skips execution when the module is imported for testing or reuse.
 *
 * @param {string} importMetaUrl - pass `import.meta.url` from the calling module
 * @param {() => Promise<void>} fn - async hook body
 */
export function runWhenInvoked(importMetaUrl, fn) {
  const entryPath = fs.realpathSync(process.argv[1]);
  const modulePath = fs.realpathSync(fileURLToPath(importMetaUrl));
  if (entryPath === modulePath) {
    fn();
  }
}

/**
 * No-op function that prints an empty JSON object and exits.
 */
export function noOp() {
  console.log(JSON.stringify({}));
  process.exit(0);
}

/**
 * Block action and exit with code 2.
 * @param {string} reason
 */
export function blockAction(reason) {
  process.stderr.write(`🛑 Security Block: ${reason}\n`);
  process.exit(2);
}

export function spawnBackground(scriptUrl, args = []) {
  const scriptPath =
    scriptUrl instanceof URL ? fileURLToPath(scriptUrl) : fileURLToPath(new URL(scriptUrl));

  const child = spawn(process.execPath, [scriptPath, ...args], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

/**
 * Parse a Claude JSONL transcript into an array of { role, content } messages.
 *
 * @param {string} transcriptPath
 * @returns {Promise<{ messages: Array<{ role: string, content: string }> }>}
 */
export function parseTranscript(transcriptPath) {
  if (transcriptPath.endsWith('.jsonl')) {
    return parseClaudeTranscript(transcriptPath);
  }
  if (transcriptPath.endsWith('.json')) {
    return parseGeminiTranscript(transcriptPath);
  }
}

function parseClaudeTranscript(transcriptPath) {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n');
    const messages = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);

        // Only process user and assistant messages
        if (entry.type === 'user' || entry.type === 'assistant') {
          const msg = entry.message;
          if (msg && msg.role && msg.content) {
            // Handle content that can be string or array of content blocks
            let contentText = '';
            if (typeof msg.content === 'string') {
              contentText = msg.content;
            } else if (Array.isArray(msg.content)) {
              // Extract text from content blocks
              contentText = msg.content
                .filter((block) => block.type === 'text')
                .map((block) => block.text)
                .join('\n');
            }

            if (contentText) {
              messages.push({
                role: msg.role,
                content: contentText,
              });
            }
          }
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }

    return { messages };
  } catch (error) {
    console.error('Failed to parse transcript:', error.message);
    return { messages: [] };
  }
}

function parseGeminiTranscript(transcriptPath) {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const { messages: rawMessages = [] } = JSON.parse(content);

    const messages = [];
    for (const msg of rawMessages) {
      if (msg.type === 'user' || msg.type === 'gemini') {
        let contentText = '';
        const msgContent = msg.displayContent || msg.content;
        if (typeof msgContent === 'string') {
          contentText = msgContent;
        } else if (Array.isArray(msgContent)) {
          contentText = msgContent.map((block) => block.text).join('\n');
        }

        if (contentText) {
          messages.push({
            role: msg.type,
            content: contentText,
          });
        }
      }
    }

    return { messages };
  } catch (error) {
    console.error('Failed to parse transcript:', error.message);
    return { messages: [] };
  }
}
