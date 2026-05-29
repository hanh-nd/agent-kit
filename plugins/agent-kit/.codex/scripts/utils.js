import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
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
export function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.on('data', (chunk) => (data += chunk.toString()));
        process.stdin.on('end', () => resolve(data));
    });
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
export function exitWithSuccess(systemMessage) {
    console.log(JSON.stringify({ systemMessage }));
    process.exit(0);
}
