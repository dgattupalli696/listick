// Page rows: each title once.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool } from '@/db';
import { pageData, shelves } from '@/server/page';
import { metaSet } from '@/server/store';
import { addTitles, addUser, fixtures, resetDb, title } from './helpers';

const m = (...n: number[]) => n.map((i) => `tmdb:movie:${i}`);
let uid = '';
before(async () => {
  await resetDb();
  fixtures({});
  uid = await addUser('rows');
  await addTitles(...Array.from({ length: 40 }, (_, i) => title(`tmdb:movie:${i + 1}`, { poster: '/p.jpg' })));
  await metaSet('rows', { rows: { at: Date.now(), theaters: m(1, 2, 3, 4, 5), 'movie-streaming-new': m(1, 2, 6, 7, 8, 9), 'movie-coming': m(3, 4, 10),
    'movie-trending': m(1, 6, 11, 12, 13), 'movie-popular': m(11, 14, 15) }, services: {}, servicesAt: 0 });
});
after(() => pool.end());

describe('page rows', () => {
  test("a page's own rows skip what's above them; one left too short is hidden", async () => {
    const rows = (await pageData(uid, new URLSearchParams())).media.rows.filter((r) => r.kind === 'movie');
    assert.deepEqual(rows.map((r) => [r.id, r.items.map((x) => x.key)]), [['theaters', m(1, 2, 3, 4, 5)], ['movie-streaming-new', m(6, 7, 8, 9)]]);
  });
  test('Trending & popular skip the page rows and each other', async () => {
    const g = (await shelves(uid, { group: 'everyone', gkind: 'movie' })).group!;
    assert.deepEqual(g.rows.map((r) => [r.id, r.items.map((x) => x.key)]), [['movie-trending', m(11, 12, 13)], ['movie-popular', m(14, 15)]]);
  });
});
