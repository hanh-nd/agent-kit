#!/usr/bin/env node
import { runSecurityPrivacyHook } from './security/hook-runner.js';
import { noOp, readStdin, runWhenInvoked } from './utils.js';

runWhenInvoked(import.meta.url, async () => {
  runSecurityPrivacyHook(await readStdin());
  noOp();
});
