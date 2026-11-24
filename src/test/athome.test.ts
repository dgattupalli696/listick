// Latest releases, list filters, Latest shows, refresh.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool } from '@/db';
import { homeReleases } from '@/server/athome';
import { preview, refreshDue, refreshList } from '@/server/lists';
import { q } from '@/server/db';
import { metaSet } from '@/server/store';
import { addTitles, addUser, calls, fixtures, resetDb, title } from './helpers';

const DAY = 86400000, now = Date.now(), ago = (d: number) => now - d * DAY;
const iso = (t: number) => new Date(t).toISOString();
const digitalOn = (t: number) => ({ results: [{ iso_3166_1: 'US', release_dates: [{ type: 4, release_date: iso(t) }] }] });
const disc = (id: number, t: number) => ({ id: String(id), key: `tmdb:movie:${id}`, title: `Film ${id}`, year: new Date(now).getUTCFullYear(), date: t, uhd: false, url: '' });

before(async () => {
  await resetDb();
  // 1: digital 10 days ago, disc 5 days ago. 2: digital 200 days ago, disc 5 days ago. 3: disc only, 20 days ago
  await metaSet('bluray', { at: now, discs: [disc(1, ago(5)), disc(2, ago(5)), disc(3, ago(20))] });
  fixtures({
    '/discover/movie': { results: [{ id: 1, title: 'Film 1', poster_path: '/p.jpg', release_date: iso(ago(100)).slice(0, 10) }], total_pages: 1 },
    '/movie/1/release_dates': digitalOn(ago(10)), '/movie/2/release_dates': digitalOn(ago(200)), '/movie/3/release_dates': { results: [] },
  });
});
after(() => pool.end());

describe('latest releases', () => {
  test('digital and Blu-ray: each film at its first day at home; an old film with a new disc stays out', async () => {
    const out = await homeReleases('US', ['digital', 'bluray'], 90, false);
    assert.deepEqual(Object.fromEntries(out), { 'tmdb:movie:1': ago(10), 'tmdb:movie:3': ago(20) });
  });
  test('Blu-ray only: ordered by disc days', async () => {
    const out = await homeReleases('US', ['bluray'], 90, false);
    assert.deepEqual(Object.fromEntries(out), { 'tmdb:movie:1': ago(5), 'tmdb:movie:2': ago(5), 'tmdb:movie:3': ago(20) });
  });
});

describe('arriving on a service', () => {
  test('a film found on the services after the first run is new that day; one there from the start keeps its own day', async () => {
    const film = (id: number) => ({ id, title: `Film ${id}`, poster_path: '/p.jpg', release_date: iso(ago(150)).slice(0, 10) });
    const filter = new URLSearchParams({ with_watch_providers: '337' });
    const base = { '/movie/6/release_dates': digitalOn(ago(30)), '/movie/7/release_dates': digitalOn(ago(200)) };
    fixtures({ ...base, '/discover/movie': { results: [film(6)], total_pages: 1 } });
    assert.deepEqual(Object.fromEntries(await homeReleases('US', ['streaming'], 90, false, filter)), { 'tmdb:movie:6': ago(30) });
    // film 7: rent or buy 200 days ago, on the service from today
    fixtures({ ...base, '/discover/movie': { results: [film(6), film(7)], total_pages: 1 } });
    const out = await homeReleases('US', ['streaming'], 90, false, filter);
    assert.equal(out.get('tmdb:movie:6'), ago(30));
    assert.ok(Date.now() - out.get('tmdb:movie:7')! < 60000);
    // with rent or buy too: its earlier day, out of the window
    assert.equal((await homeReleases('US', ['digital', 'streaming'], 90, false, filter)).has('tmdb:movie:7'), false);
  });
});

// list filters
describe('list filters', () => {
  const lands = [{ iso_3166_1: 'US', english_name: 'United States' }, { iso_3166_1: 'IN', english_name: 'India' }, { iso_3166_1: 'GB', english_name: 'United Kingdom' }];
  const base = { '/configuration/countries': lands, '/configuration/languages': [{ iso_639_1: 'en', english_name: 'English' }] };
  const asked = () => calls.filter((u) => u.includes('/discover/movie')).map((u) => new URL(u).searchParams.get('with_origin_country'));
  test('only the age ratings let in, films\' and shows\' each, in the list\'s country', async () => {
    fixtures({ ...base, '/discover/movie': { results: [], total_pages: 1 }, '/discover/tv': { results: [], total_pages: 1 } });
    await preview(await addUser('rated'), 'both', { region: 'US', certs: ['R', 'NC-17'], tvCerts: ['TV-MA'] });
    const got = (k: string) => { const u = new URL(calls.filter((x) => x.includes(k)).at(-1)!).searchParams; return [u.get('certification_country'), u.get('certification')]; };
    assert.deepEqual([got('/discover/movie'), got('/discover/tv')], [['US', 'R|NC-17'], ['US', 'TV-MA']]);
  });
  test('a TMDB list asks for every country but those left out, and drops a film made there in part', async () => {
    const film = (id: number) => ({ id, title: `Film ${id}`, poster_path: '/p.jpg', release_date: '2026-01-01' });
    fixtures({ ...base, '/discover/movie': { results: [film(30), film(31)], total_pages: 1 },
      '/movie/30?append': { origin_country: ['US'] }, '/movie/31?append': { origin_country: ['US', 'IN'] } });
    const r = await preview(await addUser('filters'), 'movie', { countriesOut: ['IN'] });
    assert.deepEqual(asked(), ['GB|US']);
    assert.deepEqual(r.posters.map((x) => x.key), ['tmdb:movie:30']);
  });
  test('Latest releases: its searches carry the filters, and a disc made there is left out', async () => {
    await addTitles(title('tmdb:movie:3', { year: new Date(now).getUTCFullYear() }));
    fixtures({ ...base, '/discover/movie': { results: [{ id: 1, title: 'Film 1', poster_path: '/p.jpg', release_date: iso(ago(100)).slice(0, 10) }], total_pages: 1 },
      '/movie/1/release_dates': digitalOn(ago(10)), '/movie/2/release_dates': digitalOn(ago(200)), '/movie/3/release_dates': { results: [] },
      '/movie/1?append': { original_language: 'en', origin_country: ['US'] }, '/movie/3?append': { original_language: 'hi', origin_country: ['IN'] } });
    const r = await preview(await addUser('latest'), 'movie', { home: ['digital', 'bluray'], countriesOut: ['IN'] });
    assert.deepEqual(r.posters.map((x) => x.key), ['tmdb:movie:1']);
    assert.deepEqual(asked(), ['GB|US']);
  });
  test('a service left out goes to TMDB; a cast member left out is checked title by title', async () => {
    const film = (id: number) => ({ id, title: `Film ${id}`, poster_path: '/p.jpg', release_date: '2026-01-01' });
    fixtures({ ...base, '/discover/movie': { results: [film(10), film(11)], total_pages: 1 },
      '/movie/10?append': { origin_country: ['US'], credits: { cast: [{ id: 500 }] } }, '/movie/11?append': { origin_country: ['US'], credits: { cast: [{ id: 501 }] } } });
    const r = await preview(await addUser('people'), 'movie', { region: 'US', servicesOut: [8], cast: [{ id: 500, name: 'Actor', out: true }] });
    const q = new URL(calls.find((u) => u.includes('/discover/movie'))!).searchParams;
    assert.deepEqual([q.get('without_watch_providers'), q.get('watch_region'), q.get('with_cast'), q.get('with_watch_monetization_types')], ['8', 'US', null, null]);
    assert.deepEqual(r.posters.map((x) => x.key), ['tmdb:movie:11']);
  });
  test('watch as: rent or buy with no service picked', async () => {
    fixtures({ ...base, '/discover/movie': { results: [], total_pages: 1 } });
    await preview(await addUser('watchas'), 'movie', { region: 'FI', watch: ['rent', 'buy'] });
    const q = new URL(calls.find((u) => u.includes('/discover/movie'))!).searchParams;
    assert.deepEqual([q.get('watch_region'), q.get('with_watch_monetization_types'), q.get('with_watch_providers')], ['FI', 'rent|buy', null]);
  });
});

describe('stand-up, concerts and shorts', () => {
  test('left out like genres: documentaries by TMDB, stand-up, concerts and shorts by their details', async () => {
    const film = (id: number) => ({ id, title: `Film ${id}`, poster_path: '/p.jpg', release_date: '2026-01-01' });
    const cast = (...roles: string[]) => ({ credits: { cast: roles.map((character, i) => ({ id: i + 1, character })) } });
    fixtures({ '/discover/movie': { results: [film(20), film(21), film(22), film(23), film(24), film(25)], total_pages: 1 },
      '/movie/20?append': { runtime: 110, genres: [{ id: 18 }], ...cast('Anna', 'Ben', 'Self') },
      '/movie/21?append': { runtime: 62, genres: [{ id: 35 }], ...cast('Self') },
      '/movie/22?append': { runtime: 30, genres: [{ id: 16 }], ...cast('Rex') },
      '/movie/23?append': { runtime: 102, genres: [{ id: 99 }, { id: 80 }], ...cast('Self (archival footage)', 'Self') },
      '/movie/24?append': { runtime: 120, genres: [{ id: 10402 }], ...cast('Self', 'Self - Guest') },
      '/movie/25?append': { runtime: 13, genres: [{ id: 35 }], ...cast('Self', 'Self') } });
    const r = await preview(await addUser('features'), 'movie', { without: ['Stand-up comedy', 'Concerts', 'Shorts'] });
    assert.deepEqual(r.posters.map((x) => x.key), ['tmdb:movie:20', 'tmdb:movie:23']);
    const docs = await preview(await addUser('features2'), 'movie', { without: ['Documentary', 'Stand-up comedy', 'Concerts', 'Shorts'] });
    assert.equal(new URL(calls.findLast((u) => u.includes('/discover/movie'))!).searchParams.get('without_genres'), '99');
    assert.deepEqual(docs.posters.map((x) => x.key).filter((k) => k !== 'tmdb:movie:23'), ['tmdb:movie:20']);
    // stand-up only
    const only = await preview(await addUser('specials'), 'movie', { genres: ['Stand-up comedy'] });
    assert.deepEqual(only.posters.map((x) => x.key), ['tmdb:movie:21']);
    assert.equal(new URL(calls.findLast((u) => u.includes('/discover/movie'))!).searchParams.get('with_genres'), '35');
    const concerts = await preview(await addUser('concerts'), 'movie', { genres: ['Concerts'] });
    assert.deepEqual(concerts.posters.map((x) => x.key), ['tmdb:movie:24']);
  });
});

describe('latest shows', () => {
  test('new shows by their first episode (one with no poster yet left out), returning ones by a season begun lately (not one airing weekly)', async () => {
    const day = (d: number) => iso(ago(d)).slice(0, 10), show = (id: number, first: string) => ({ id, name: `Show ${id}`, poster_path: '/p.jpg', first_air_date: first });
    fixtures({ '&air_date.gte': { results: [show(41, '2020-01-01'), show(42, '2019-01-01')], total_pages: 1 },
      '&first_air_date.gte': { results: [show(40, day(5)), { ...show(43, day(2)), poster_path: null }], total_pages: 1 },
      '/tv/41': { seasons: [{ season_number: 1, air_date: '2020-01-01' }, { season_number: 2, air_date: day(10) }] },
      '/tv/42': { seasons: [{ season_number: 0, air_date: day(3) }, { season_number: 3, air_date: day(200) }] } });
    const r = await preview(await addUser('shows'), 'tv', { airing: ['new', 'returning'] });
    assert.deepEqual(r.posters.map((x) => [x.key, x.day]), [['tmdb:tv:40', Date.parse(day(5))], ['tmdb:tv:41', Date.parse(day(10))]]);
    const only = await preview(await addUser('returning'), 'tv', { airing: ['returning'] });
    assert.deepEqual(only.posters.map((x) => x.key), ['tmdb:tv:41']);
  });
  test('Available: its searches ask for shows on the services there', async () => {
    fixtures({ '/discover/tv': { results: [], total_pages: 1 } });
    await preview(await addUser('airing-on'), 'tv', { airing: ['new', 'returning'], region: 'IN', reach: 'streaming', watch: ['flatrate', 'rent'] });
    const asked = calls.filter((u) => u.includes('/discover/tv')).slice(-2).map((u) => { const q = new URL(u).searchParams; return [q.get('watch_region'), q.get('with_watch_monetization_types')]; });
    assert.deepEqual(asked, [['IN', 'flatrate|rent'], ['IN', 'flatrate|rent']]);
  });
});

describe('refresh', () => {
  test('a list refreshed every 6 hours is due after 7; a daily one is not', async () => {
    fixtures({ '/discover/movie': { results: [], total_pages: 1 } });
    const uid = await addUser('refresh'), at = Date.now() - 7 * 3600000;
    for (const [id, refresh] of [['six', '6h'], ['day', 'daily']])
      await q.run(`insert into lists (id, user_id, name, kind, media, filters, created_at, refreshed_at) values (?, ?, ?, 'smart', 'movie', ?::jsonb, ?, ?)`, id, uid, id, JSON.stringify({ refresh }), at, at);
    await refreshDue();
    const r = await q.all<{ id: string; refreshed_at: number }>(`select id, refreshed_at from lists where id in ('six', 'day') order by id`);
    assert.deepEqual(r.map((x) => [x.id, x.refreshed_at > at]), [['day', false], ['six', true]]);
  });
  test('the preview gives Latest releases their day at home', async () => {
    await metaSet('bluray', { at: now, discs: [disc(3, ago(20))] });
    fixtures({ '/discover/movie': { results: [], total_pages: 1 } });
    const r = await preview(await addUser('days'), 'movie', { home: ['bluray'] });
    assert.deepEqual(r.posters.map((x) => [x.key, x.day]), [['tmdb:movie:3', ago(20)]]);
  });
  test('Latest releases: a film found after the first run goes on top, not back at its own day; changed filters start over', async () => {
    await addTitles(title('tmdb:movie:11'), title('tmdb:movie:12'), title('tmdb:movie:13'));
    fixtures({ '/discover/movie': { results: [], total_pages: 1 } });
    const uid = await addUser('arrive'), items = async () => (await q.one<{ items: string[] }>(`select items from lists where id = 'arrive'`))!.items;
    await q.run(`insert into lists (id, user_id, name, kind, media, filters, created_at) values ('arrive', ?, 'arrive', 'smart', 'movie', ?::jsonb, ?)`, uid, JSON.stringify({ home: ['bluray'] }), now);
    await metaSet('bluray', { at: now, discs: [disc(11, ago(2)), disc(12, ago(10))] });
    await refreshList(uid, 'arrive');
    assert.deepEqual(await items(), ['tmdb:movie:11', 'tmdb:movie:12']);
    await metaSet('bluray', { at: now, discs: [disc(11, ago(2)), disc(12, ago(10)), disc(13, ago(6))] });
    await refreshList(uid, 'arrive');
    assert.deepEqual(await items(), ['tmdb:movie:13', 'tmdb:movie:11', 'tmdb:movie:12']);
    await refreshList(uid, 'arrive', true);
    assert.deepEqual(await items(), ['tmdb:movie:11', 'tmdb:movie:13', 'tmdb:movie:12']);
  });
});
