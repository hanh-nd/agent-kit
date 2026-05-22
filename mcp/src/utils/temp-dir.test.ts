import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function createTempDirTracker(): {
  makeTempDir(prefix: string): string;
  cleanup(): void;
} {
  const tempDirs: string[] = [];

  return {
    makeTempDir(prefix: string): string {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
      tempDirs.push(tempDir);
      return tempDir;
    },
    cleanup(): void {
      while (tempDirs.length > 0) {
        const tempDir = tempDirs.pop();
        if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}
