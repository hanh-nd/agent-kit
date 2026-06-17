import { execSync } from 'node:child_process';

export function countTests(projectDir: string = process.cwd()): number {
  const excludePrune = [
    "-path '*/node_modules/*'",
    "-path '*/dist/*'",
    "-path '*/build/*'",
    "-path '*/.git/*'",
  ].join(' -o ');

  const nameMatchers = [
    "-name '*.test.ts'",
    "-name '*.test.tsx'",
    "-name '*.test.js'",
    "-name '*.test.jsx'",
    "-name '*.spec.ts'",
    "-name '*.spec.tsx'",
    "-name '*.spec.js'",
    "-name '*.spec.jsx'",
    "-path '*/__tests__/*'",
  ].join(' -o ');

  const command = `find . \\( ${excludePrune} \\) -prune -o \\( ${nameMatchers} \\) -print | wc -l`;

  try {
    const result = execSync(command, {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return parseInt(result, 10) || 0;
  } catch {
    return 0;
  }
}
