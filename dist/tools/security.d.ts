/**
 * Security Helpers - Prevent Command Injection
 * Exported utilities for safe command execution
 */
/**
 * Sanitize string for safe use with execFileSync
 * Only removes dangerous shell operators - safe chars like !?#* are allowed
 * since execFileSync doesn't invoke a shell and handles args safely
 *
 * NOTE: Flag injection is NOT handled here because:
 * 1. execFileSync uses arg arrays, not shell parsing
 * 2. Adding -- prefix would corrupt content (e.g., commit messages)
 * 3. Callers should use '--' separator when needed for specific commands
 */
export declare function sanitize(input: string): string;
/**
 * Validate file path to prevent path traversal attacks
 * Uses stricter path.sep check to prevent prefix matching flaws
 * (e.g., /.geminit-kit/handoffs/app should not match /.geminit-kit/handoffs/app-secret)
 */
export declare function validatePath(filePath: string, baseDir?: string): string;
/**
 * Safe git command execution using execFileSync
 * Includes stderr in error message for better debugging
 *
 * @param timeout Default from GEMINI_KIT_GIT_TIMEOUT env var or 30s
 */
export declare function safeGit(args: string[], options?: {
    timeout?: number;
    cwd?: string;
}): string;
/**
 * Check if a command exists (cross-platform)
 * Uses 'where' on Windows, 'which' on macOS/Linux
 */
export declare function commandExists(cmd: string): boolean;
/**
 * Async file finder - non-blocking for large repos
 * Uses queue-based approach to prevent stack overflow on deep directories
 */
export declare function findFilesAsync(dir: string, extensions: string[], maxFiles: number, excludeDirs?: string[]): Promise<string[]>;
