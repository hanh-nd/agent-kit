import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mapLimit } from './async.js';

describe('mapLimit', () => {
  test('returns an empty array for empty input', async () => {
    const results = await mapLimit([], 3, async (item: number) => item);
    assert.deepEqual(results, []);
  });

  test('preserves result order while workers resolve out of order', async () => {
    const results = await mapLimit([30, 10, 20], 3, async (delayMs, index) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return index;
    });

    assert.deepEqual(results, [0, 1, 2]);
  });

  test('caps active workers at the configured limit', async () => {
    let active = 0;
    let maxActive = 0;

    await mapLimit([1, 2, 3, 4, 5], 2, async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return item;
    });

    assert.equal(maxActive, 2);
  });

  test('clamps invalid limits to one worker', async () => {
    let active = 0;
    let maxActive = 0;

    await mapLimit([1, 2, 3], 0, async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return item;
    });

    assert.equal(maxActive, 1);
  });

  test('rejects with the original worker error', async () => {
    const expected = new Error('worker failed');

    await assert.rejects(
      mapLimit([1, 2], 2, async (item) => {
        if (item === 2) throw expected;
        return item;
      }),
      expected,
    );
  });
});
