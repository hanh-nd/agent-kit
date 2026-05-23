import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, test, beforeEach } from 'node:test';
import { createTempDirTracker } from '../../utils/temp-dir.test.js';
import { initializeConversationDigestModel } from './processor.js';
import { DigestModelId } from './types.js';

const tempDirs = createTempDirTracker();

let originalHome: string | undefined;
let originalUserProfile: string | undefined;

beforeEach(() => {
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  const mockHome = tempDirs.makeTempDir('mock-home-');
  process.env.HOME = mockHome;
  process.env.USERPROFILE = mockHome;
});

afterEach(() => {
  tempDirs.cleanup();
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
});

describe('initializeConversationDigestModel', () => {
  test('rejects unknown model and leaves settings absent', async () => {
    const workspace = tempDirs.makeTempDir('digest-init-');
    const result = await initializeConversationDigestModel({
      workspaceRoot: workspace,
      modelId: 'unknown-model',
      allowDownload: true,
    });

    assert.equal(result.initialized, false);
    assert.equal(fs.existsSync(path.join(workspace, '.agent-kit', 'settings.json')), false);
  });

  test('requires explicit download permission and leaves settings absent', async () => {
    const workspace = tempDirs.makeTempDir('digest-init-');
    const result = await initializeConversationDigestModel({
      workspaceRoot: workspace,
      modelId: DigestModelId.BASE,
      allowDownload: false,
    });

    assert.equal(result.initialized, false);
    assert.equal(fs.existsSync(path.join(workspace, '.agent-kit', 'settings.json')), false);
  });
});
