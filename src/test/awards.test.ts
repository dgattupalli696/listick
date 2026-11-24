// Awards.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool } from '@/db';
import { awardBits, awardsPass, fromOmdb } from '@/server/awards';
import { q } from '@/server/db';
import { fits, type Facts } from '@/server/facts';
import { season } from '@/server/lists';
import { checkDue, verdict } from '@/server/scores';
import { metaSet } from '@/server/store';
import { addUser, resetDb } from './helpers';

before(async () => {
  await resetDb();
  await metaSet('awards', { at: Date.now(), v: { 'globe-won': ['tt1'], 'cannes-nom': ['tt2'], 'razzie-won': ['tt3'], 'picture-nom': ['tt3'] } });
});
after(() => pool.end());

describe('awards', () => {
  test("OMDb's line: its top award, and any award from the counts", () => {
    const won = fromOmdb('Won 3 Oscars. 120 wins & 200 nominations total');
    assert.ok(awardsPass(won, ['oscar-won']) && awardsPass(won, ['oscar-nom']) && awardsPass(won, ['any-won']));
    const emmyNom = fromOmdb('Nominated for 2 Primetime Emmys. 5 nominations total');
    assert.deepEqual([awardsPass(emmyNom, ['emmy-nom']), awardsPass(emmyNom, ['emmy-won']), awardsPass(emmyNom, ['any-nom']), awardsPass(emmyNom, ['any-won'])], [true, false, true, false]);
    assert.equal(fromOmdb(null), 0);
  });
  test("Wikidata's lists add what OMDb leaves out (a Golden Globe beside an Oscar)", async () => {
    const b = await awardBits('tt1', 'Won 1 Oscar. 4 wins & 9 nominations total');
    assert.ok(awardsPass(b, ['globe-won']) && awardsPass(b, ['oscar-won']));
    assert.ok(awardsPass(await awardBits('tt2', null), ['cannes-nom']) && !awardsPass(await awardBits('tt2', null), ['cannes-won']));
    assert.ok(awardsPass(await awardBits('tt2', null), ['any-nom']));
  });
  test("the worker's scores job finds the lists asking for awards", async () => {
    const uid = await addUser('awards');
    await q.run(`insert into lists (id, user_id, name, kind, media, filters, created_at) values ('aw', ?, 'Oscars', 'smart', 'movie', ?::jsonb, ?)`, uid, JSON.stringify({ awards: ['oscar-won'] }), Date.now());
    await checkDue(async () => {});
  });
  test('a list: any asked for, none left out; unchecked titles wait', () => {
    const b = fromOmdb('Won 2 Oscars. 3 wins total');
    assert.equal(verdict({ awards: b }, { awards: ['oscar-won', 'emmy-won'] }), 'pass');
    assert.equal(verdict({ awards: b }, { awardsOut: ['oscar-nom'] }), 'fail');
    assert.equal(verdict({}, { awards: ['oscar-won'] }), 'pending');
    assert.equal(verdict({ awards: 0 }, { awards: ['oscar-won'] }), 'fail');
  });
});

describe('smart list checks', () => {
  test("anime seasons are calendar quarters, across a year's edge", () => {
    const nov = new Date(Date.UTC(2026, 10, 24));
    assert.deepEqual([season(0, nov), season(-1, nov), season(1, nov)], [{ gte: '2026-10-01', lte: '2026-12-31' }, { gte: '2026-07-01', lte: '2026-09-30' }, { gte: '2027-01-01', lte: '2027-03-31' }]);
    assert.deepEqual(season(-1, new Date(Date.UTC(2026, 1, 3))), { gte: '2025-10-01', lte: '2025-12-31' });
  });
  test('a Razzie is its own, not any award; Best Picture is', async () => {
    const b = await awardBits('tt3', null);
    assert.ok(awardsPass(b, ['razzie-won']) && awardsPass(b, ['picture-nom']) && !awardsPass(b, ['picture-won']));
    assert.ok(awardsPass(b, ['any-nom']) && !awardsPass(b, ['any-won']));
  });
  test("a source's ceiling, and the average of the sources on (here Kitsu only)", () => {
    assert.equal(verdict({ kitsu: 80 }, { ext: { kitsu: 60 }, extTo: { kitsu: 70 } }), 'fail');
    assert.equal(verdict({ kitsu: 65 }, { ext: { kitsu: 60 }, extTo: { kitsu: 70 } }), 'pass');
    assert.equal(verdict({ kitsu: 80 }, { avg: 75 }), 'pass');
    assert.equal(verdict({ kitsu: 70 }, { avg: 75 }), 'fail');
    assert.equal(verdict({}, { avg: 75 }), 'pending');
    assert.equal(verdict({ kitsu: null }, { avg: 75, missing: 'keep' }), 'pass');
    assert.equal(verdict({ kitsu: 80, tmdb: 6 }, { avg: 75 }), 'fail');
    assert.equal(verdict({ kitsu: 80, tmdb: 9 }, { avg: 75, avgTo: 82 }), 'fail');
    assert.equal(verdict({ kitsu: 70, tmdb: 8 }, { avg: 70, avgTo: 80 }), 'pass');
  });
  test('keywords all, collections, trailers, networks, franchises, money, status', () => {
    const f: Facts = { movie: true, lang: 'en', lands: [], genres: [], keywords: [1, 2], companies: [], networks: [], cast: [], crew: [], votes: 0, runtime: 100, self: 0,
      trailer: true, collection: 9, part: 2, budget: 50e6, revenue: 0, status: 'Released' };
    const kw = [{ id: 1 }, { id: 3 }];
    assert.ok(fits({ keywords: kw }, f) && !fits({ keywords: kw, kwMatch: 'all' }, f));
    assert.deepEqual((['in', 'first', 'later', 'out'] as const).map((collection) => fits({ collection }, f)), [true, false, true, false]);
    assert.ok(fits({ collection: 'out' }, { ...f, collection: 0, part: 0 }) && !fits({ trailer: true }, { ...f, trailer: false }));
    const show = { ...f, movie: false, networks: [213] };
    assert.deepEqual([fits({ networks: [213] }, show), fits({ networks: [{ id: 49 }] }, show), fits({ networks: [{ id: 213, out: true }] }, show), fits({ networks: [49] }, f)],
      [true, false, false, true]);
    assert.deepEqual([fits({ collections: [{ id: 9 }] }, f), fits({ collections: [{ id: 8 }] }, f), fits({ collections: [{ id: 9, out: true }] }, f),
      fits({ budgetFrom: 25e6 }, f), fits({ budgetFrom: 100e6 }, f), fits({ revenueFrom: 1 }, f), fits({ movieStatus: ['Released'] }, f), fits({ movieStatus: ['Planned'] }, f)],
      [true, false, false, true, false, false, true, false]);
  });
});
