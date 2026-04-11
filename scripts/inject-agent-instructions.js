#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { noOp, runWhenInvoked } from './utils.js';

runWhenInvoked(import.meta.url, () => {
  const __filename = fileURLToPath(import.meta.url);
  const pluginRoot = path.dirname(path.dirname(__filename));
  const instructionPath = path.join(pluginRoot, 'docs', 'instruction.md');

  let content = '';
  try {
    content = fs.readFileSync(instructionPath, 'utf8').trim();
  } catch (error) {
    noOp();
  }

  if (!content) {
    noOp();
  }

  console.log(content);
  process.exit(0);
});
