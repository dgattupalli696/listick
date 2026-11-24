// Where to watch: one entry per service at its best way, plans and channels folded in, yours marked.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { waysOf } from '@/server/details';

describe('where to watch', () => {
  test('each service once, at its best way; a plan counts as the service; a channel is left out', () => {
    const s = [{ id: 1, name: 'Netflix', logo: null }, { id: 2, name: 'Netflix Standard with Ads', logo: null }, { id: 3, name: 'Apple TV Store', logo: null },
      { id: 4, name: 'HBO Max Amazon Channel', logo: null }, { id: 5, name: 'Pluto TV', logo: null }];
    const got = waysOf({ f: [1, 4], x: [5], r: [3, 1], b: [3] }, s, [2]);
    assert.deepEqual(got.map((x) => [x.name, x.kind, x.mine]), [['Netflix', 'stream', false], ['Pluto TV', 'free', false], ['Apple TV', 'rent', false]]);
    assert.deepEqual(waysOf({ f: [2], x: [], r: [], b: [] }, s, [2]).map((x) => x.mine), [true]);
  });
});
