import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseDigestWorkerSuccess } from '../digest/worker.js';
import { DIGEST_WORKER_RESULT_PREFIX } from '../digest/constants.js';

function workerResultLine(result: unknown): string {
  return DIGEST_WORKER_RESULT_PREFIX + JSON.stringify(result);
}

describe('parseDigestWorkerSuccess', () => {
  test('accepts a structured provisional digest worker line', () => {
    const stdout = [
      '[memory-kit] model-load: 612ms',
      workerResultLine({
        markdown: '/tmp/conversation-digests/abc-conv.md',
        status: 'provisional',
        contentHash: 'abc',
        indexed: true,
        skipped: false,
      }),
    ].join('\n');

    assert.equal(parseDigestWorkerSuccess(stdout), true);
  });

  test('rejects stdout that only mentions markdown as plain text', () => {
    const stdout = 'The model produced markdown but no digest result envelope.';

    assert.equal(parseDigestWorkerSuccess(stdout), false);
  });

  test('rejects unprefixed JSON objects', () => {
    const stdout = [
      JSON.stringify({ markdown: '/tmp/file.md', status: 'draft' }),
      JSON.stringify({ markdown: '/tmp/file.md', status: 'provisional' }),
    ].join('\n');

    assert.equal(parseDigestWorkerSuccess(stdout), false);
  });

  test('uses the last valid digest worker line after noisy output', () => {
    const stdout = [
      JSON.stringify({ event: 'model-load', markdown: false }),
      'Metal cleanup warning',
      workerResultLine({ markdown: '/tmp/final.md', status: 'provisional' }),
      'trailing non-json output',
    ].join('\n');

    assert.equal(parseDigestWorkerSuccess(stdout), true);
  });

  test('rejects malformed digest worker lines', () => {
    const stdout = ['[memory-kit] model-load: 612ms', DIGEST_WORKER_RESULT_PREFIX + '{"markdown":'].join('\n');

    assert.equal(parseDigestWorkerSuccess(stdout), false);
  });
});
