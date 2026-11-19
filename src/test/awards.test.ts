// Awards.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool } from '@/db';
import { awardBits, awardsPass, fromOmdb } from '@/server/awards';
import { q } from '@/server/db';
import { checkDue, verdict } from '@/server/scores';
import { metaSet } from '@/server/store';
import { addUser, resetDb } from './helpers';

before(async () => {
  await resetDb();
  await metaSet('awards', { at: Date.now(), v: { 'globe-won': ['tt1'], 'cannes-nom': ['tt2'] } });
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
