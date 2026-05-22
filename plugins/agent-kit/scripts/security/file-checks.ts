import * as path from 'path';
import type { SecurityPolicy } from '@types';

export function isBlockedFilename(
  name: string,
  policy: Pick<SecurityPolicy, 'forbiddenFiles' | 'forbiddenRegexes'>
): boolean {
  const lower = name.toLowerCase();
  if (policy.forbiddenFiles.some((f) => lower === f)) return true;
  if (policy.forbiddenRegexes.some((re) => re.test(name))) return true;
  return false;
}

export function isInForbiddenDir(
  filePath: string,
  policy: Pick<SecurityPolicy, 'forbiddenDirs'>
): string | null {
  const segments = filePath.split(/[/\\]+/);
  return segments.find((s) => policy.forbiddenDirs.includes(s.toLowerCase())) ?? null;
}
