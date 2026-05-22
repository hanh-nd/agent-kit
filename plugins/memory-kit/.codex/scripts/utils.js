import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function acquireFileLock(lockPath, opts) {
    const retryMs = opts?.retryMs ?? 50;
    const timeoutMs = opts?.timeoutMs ?? 500;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
            return true;
        }
        catch {
            await new Promise((r) => setTimeout(r, retryMs));
        }
    }
    return false;
}
export function releaseFileLock(lockPath) {
    try {
        fs.unlinkSync(lockPath);
    }
    catch {
        // ignore ENOENT
    }
}
export function runWhenInvoked(importMetaUrl, fn) {
    if (!process.argv[1])
        return;
    const entryPath = fs.realpathSync(process.argv[1]);
    const modulePath = fs.realpathSync(fileURLToPath(importMetaUrl));
    if (entryPath === modulePath) {
        void fn();
    }
}
export function noOp() {
    console.log(JSON.stringify({}));
    process.exit(0);
}
export function exitWithSuccess(systemMessage) {
    console.log(JSON.stringify({ systemMessage }));
    process.exit(0);
}
export function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.on('data', (chunk) => (data += String(chunk)));
        process.stdin.on('end', () => resolve(data));
    });
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
export function getProvider(transcriptPath) {
    if (transcriptPath.includes('.codex')) {
        return 'codex';
    }
    if (transcriptPath.includes('.gemini')) {
        return 'gemini';
    }
    return 'claude';
}
export function parseTranscript(transcriptPath) {
    const provider = getProvider(transcriptPath);
    if (provider === 'codex') {
        return parseCodexTranscript(transcriptPath);
    }
    if (provider === 'gemini') {
        return parseGeminiTranscript(transcriptPath);
    }
    return parseClaudeTranscript(transcriptPath);
}
function extractContentText(content) {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return '';
    return content
        .map((block) => {
        if (!isRecord(block))
            return '';
        return block.text || block.output_text || block.input_text || '';
    })
        .filter((text) => typeof text === 'string')
        .filter(Boolean)
        .join('\n');
}
function parseCodexTranscript(transcriptPath) {
    try {
        const content = fs.readFileSync(transcriptPath, 'utf8');
        const lines = content.trim().split('\n');
        const messages = [];
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                if (!isRecord(entry))
                    continue;
                const payload = entry.payload;
                if (!isRecord(payload))
                    continue;
                if (entry.type !== 'response_item' || payload?.type !== 'message')
                    continue;
                if (payload.role !== 'user' && payload.role !== 'assistant')
                    continue;
                const contentText = extractContentText(payload.content);
                if (contentText) {
                    messages.push({ role: payload.role, content: contentText });
                }
            }
            catch {
                continue;
            }
        }
        return { messages };
    }
    catch (error) {
        if (error instanceof Error)
            console.error('Failed to parse Codex transcript:', error.message);
        return { messages: [] };
    }
}
function parseClaudeTranscript(transcriptPath) {
    try {
        const content = fs.readFileSync(transcriptPath, 'utf8');
        const lines = content.trim().split('\n');
        const messages = [];
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                if (!isRecord(entry))
                    continue;
                if (entry.type === 'user' || entry.type === 'assistant') {
                    const msg = entry.message;
                    if (isRecord(msg) && (msg.role === 'user' || msg.role === 'assistant') && msg.content) {
                        let contentText = '';
                        if (typeof msg.content === 'string') {
                            contentText = msg.content;
                        }
                        else if (Array.isArray(msg.content)) {
                            contentText = msg.content
                                .filter((block) => isRecord(block) && block.type === 'text')
                                .map((block) => block.text ?? '')
                                .join('\n');
                        }
                        if (contentText) {
                            messages.push({ role: msg.role, content: contentText });
                        }
                    }
                }
            }
            catch {
                continue;
            }
        }
        return { messages };
    }
    catch (error) {
        if (error instanceof Error)
            console.error('Failed to parse transcript:', error.message);
        return { messages: [] };
    }
}
function parseGeminiTranscript(transcriptPath) {
    try {
        const content = fs.readFileSync(transcriptPath, 'utf8');
        const lines = content.trim().split('\n');
        const messages = [];
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const msg = JSON.parse(line);
                if (!isRecord(msg))
                    continue;
                if (msg.type === 'user' || msg.type === 'gemini') {
                    let contentText = '';
                    const msgContent = msg.displayContent || msg.content;
                    if (typeof msgContent === 'string') {
                        contentText = msgContent;
                    }
                    else if (Array.isArray(msgContent)) {
                        contentText = msgContent
                            .filter((block) => isRecord(block))
                            .map((block) => block.text ?? '')
                            .join('\n');
                    }
                    if (contentText) {
                        messages.push({ role: msg.type, content: contentText });
                    }
                }
            }
            catch {
                continue;
            }
        }
        return { messages };
    }
    catch (error) {
        if (error instanceof Error)
            console.error('Failed to parse Gemini transcript:', error.message);
        return { messages: [] };
    }
}
