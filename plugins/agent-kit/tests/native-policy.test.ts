import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildNativePermissions,
  deriveClaudeDenyRules,
} from '../scripts/generate-native-policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMITTED = path.resolve(__dirname, '../../native-permissions.json');

describe('native permissions parity', () => {
  test('committed file matches constants-derived output', () => {
    const expected = `${JSON.stringify(buildNativePermissions(), null, 2)}\n`;
    const actual = fs.readFileSync(COMMITTED, 'utf8');
    assert.equal(actual, expected, 'run npm run build to regenerate native-permissions.json');
  });

  test('deny rules cover every forbidden file and dir', () => {
    const rules = deriveClaudeDenyRules();
    assert.ok(rules.includes('Read(.env)'));
    assert.ok(rules.includes('Read(.ssh/**)'));
    assert.ok(rules.includes('Read(**/.env.*)'));
    assert.ok(rules.every((rule) => /^(Read|Edit|Write)\(/.test(rule)));
  });

  test('rules are unique', () => {
    assert.equal(new Set(deriveClaudeDenyRules()).size, deriveClaudeDenyRules().length);
  });
});
