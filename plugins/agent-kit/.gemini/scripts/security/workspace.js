import * as fs from 'fs';
import * as path from 'path';
export function resolveWorkspacePath(filePath, policy) {
    try {
        const abs = path.resolve(policy.projectDir, filePath);
        try {
            return fs.realpathSync(abs);
        }
        catch (err) {
            if (!(err instanceof Error) ||
                !('code' in err) ||
                (err.code !== 'ENOENT' && err.code !== 'ENOTDIR'))
                return abs;
            // Walk up to find deepest existing ancestor
            const segments = abs.split(path.sep);
            let i = segments.length - 1;
            while (i > 0) {
                const candidate = segments.slice(0, i).join(path.sep) || path.sep;
                if (fs.existsSync(candidate)) {
                    const resolved = fs.realpathSync(candidate);
                    const rest = segments.slice(i);
                    return path.join(resolved, ...rest);
                }
                i--;
            }
            return abs;
        }
    }
    catch {
        return path.resolve(policy.projectDir, filePath);
    }
}
function isOutsideWorkspace(filePath, policy) {
    const resolved = resolveWorkspacePath(filePath, policy);
    const projectDir = policy.projectDir;
    if (policy.caseInsensitive) {
        const rLower = resolved.toLowerCase();
        const pLower = projectDir.toLowerCase();
        return rLower !== pLower && !rLower.startsWith(pLower + path.sep);
    }
    return resolved !== projectDir && !resolved.startsWith(projectDir + path.sep);
}
function isInAllowedOutsidePath(filePath, policy) {
    if (policy.allowedOutsidePaths.length === 0)
        return false;
    const resolved = resolveWorkspacePath(filePath, policy);
    return policy.allowedOutsidePaths.some((allowed) => {
        if (policy.caseInsensitive) {
            const rLower = resolved.toLowerCase();
            const aLower = allowed.toLowerCase();
            return rLower === aLower || rLower.startsWith(aLower + path.sep);
        }
        return resolved === allowed || resolved.startsWith(allowed + path.sep);
    });
}
export function shouldBlockOutside(filePath, policy) {
    return (isOutsideWorkspace(filePath, policy) &&
        !isInAllowedOutsidePath(filePath, policy) &&
        !policy.allowOutside);
}
