// Other sources' scores for smart lists: IMDb, Rotten Tomatoes and Metacritic (through OMDb), MyAnimeList and Kitsu (anime, by
// Fribb's links), checked title by title and kept in title_scores (a score, or null: checked, the source has none) for 30 days.
// TMDB can't filter on them, so a list with these floors keeps a pool of TMDB candidates (meta list-pool:<id>) and takes those
// that pass; the worker's scores job checks the rest a few at a time, within OMDb's daily allowance, and picks the lists again.
// Awards likewise (source 'awards')
import { awardBits, awardsPass } from './awards';
import { omdbFor } from './details';
import { q } from './db';
import { fribb, loadFribb } from './mapping';
import { OMDB_DAILY, kitsu, localDay, mal, tmdb } from './sources';
import type { KitsuOne } from './types';
import { HOUR, env } from './util';

export type Src = 'imdb' | 'rt' | 'mc' | 'mal' | 'kitsu';
const SRC: Src[] = ['imdb', 'rt', 'mc', 'mal', 'kitsu'];
// a list's floors (imdb and mal 0-10, rt and kitsu in %, mc 0-100), whether a title must pass all of them or any, and what a
// source with no score for a title counts as
// extTo: ceilings, the same way; avg, avgTo: the average of the title's scores (TMDB's too), each on 0-100; imdbVotes, malVotes
// (…To: ceilings): IMDb's and MyAnimeList's vote counts, always required
// awards: any of these; awardsOut: none of these
export type ScoreRule = { ext?: Partial<Record<Src, number>>; extTo?: Partial<Record<Src, number>>; avg?: number; avgTo?: number; imdbVotes?: number; imdbVotesTo?: number; malVotes?: number; malVotesTo?: number; meet?: 'all' | 'any'; missing?: 'out' | 'keep';
  awards?: string[]; awardsOut?: string[] };
type Got = Src | 'awards' | 'imdbv' | 'malv';
const OMDB: Got[] = ['imdb', 'rt', 'mc', 'imdbv'];
// awards use OMDb when there's a key
const usesOmdb = (s: Got) => OMDB.includes(s) || (s === 'awards' && !!env('OMDB_API_KEY'));
const STALE = 30 * 24 * HOUR;
// the sources this instance can check (OMDb and MyAnimeList need their keys)
const sourcesOn = (): Record<Got, boolean> => ({ imdb: !!env('OMDB_API_KEY'), rt: !!env('OMDB_API_KEY'), mc: !!env('OMDB_API_KEY'), mal: !!env('MAL_CLIENT_ID'), kitsu: true, awards: true, imdbv: !!env('OMDB_API_KEY'), malv: !!env('MAL_CLIENT_ID') });
const set = (l?: Partial<Record<Src, number>>) => Object.entries(l || {}).filter(([s, v]) => SRC.includes(s as Src) && typeof v === 'number' && v > 0) as [Src, number][];
// each source set: its floor and ceiling (0: none)
export const floorsOf = (r: ScoreRule) => { const lo = set(r.ext), hi = set(r.extTo);
  return [...new Set([...lo, ...hi].map(([s]) => s))].map((s): [Src, number, number] => [s, lo.find((x) => x[0] === s)?.[1] || 0, hi.find((x) => x[0] === s)?.[1] || 0]); };
const on = (s: Got) => sourcesOn()[s];
const hundred = (s: Src, v: number) => (s === 'imdb' || s === 'mal' ? v * 10 : v);
// what a list needs checked per title
const needs = (r: ScoreRule): Got[] => [...new Set([...floorsOf(r).map(([s]) => s), ...(r.avg || r.avgTo ? SRC.filter(on) : []),
  ...(r.awards?.length || r.awardsOut?.length ? ['awards' as const] : []), ...(r.imdbVotes || r.imdbVotesTo ? ['imdbv' as const] : []),
  ...(r.malVotes || r.malVotesTo ? ['malv' as const] : [])])];
export const scored = (r: ScoreRule) => needs(r).length > 0;

type Known = Map<string, Partial<Record<Got, number | null>>>;
export async function known(keys: string[]): Promise<Known> {
  const out: Known = new Map();
  if (!keys.length) return out;
  for (const r of await q.all<{ key: string; source: Got; score: number | null; checked_at: number }>('select key, source, score, checked_at from title_scores where key = any(?)', keys))
    if (Date.now() - r.checked_at < STALE) (out.get(r.key) || out.set(r.key, {}).get(r.key)!)[r.source] = r.score;
  return out;
}
// pass, fail, or pending (a source not checked yet decides it)
// tmdb: the title's TMDB score (0-10), for the average
export function verdict(s: Partial<Record<Got | 'tmdb', number | null>> | undefined, r: ScoreRule): 'pass' | 'fail' | 'pending' {
  const floors = floorsOf(r), each = floors.map(([src, floor, ceil]) => {
    const v = s?.[src];
    return v === undefined ? 'unknown' : v === null ? (r.missing === 'keep' ? 'pass' : 'fail') : v >= floor && (!ceil || v <= ceil) ? 'pass' : 'fail';
  });
  // shortcut: a plain mean, not weighted by votes; weigh it if few-vote titles crowd lists
  if (r.avg || r.avgTo) {
    const got = SRC.filter(on).map((x) => [x, s?.[x]] as const), have = got.flatMap(([x, v]) => (typeof v === 'number' ? [hundred(x, v)] : []));
    if (typeof s?.tmdb === 'number') have.push(s.tmdb * 10);
    const mean = have.reduce((a, v) => a + v, 0) / have.length;
    each.push(got.some(([, v]) => v === undefined) ? 'unknown' : !have.length ? (r.missing === 'keep' ? 'pass' : 'fail')
      : mean >= (r.avg || 0) && (!r.avgTo || mean <= r.avgTo) ? 'pass' : 'fail');
  }
  const scores = !each.length ? 'pass' : r.meet === 'any' ? (each.includes('pass') ? 'pass' : each.includes('unknown') ? 'pending' : 'fail')
    : each.includes('fail') ? 'fail' : each.includes('unknown') ? 'pending' : 'pass';
  const count = (src: 'imdbv' | 'malv', lo?: number, hi?: number) => {
    const v = s?.[src];
    return (!lo && !hi) || !on(src) ? 'pass' : v === undefined ? 'pending' : v === null ? (r.missing === 'keep' ? 'pass' : 'fail') : v >= (lo || 0) && (!hi || v <= hi) ? 'pass' : 'fail';
  };
  const a = s?.awards, awards = !needs(r).includes('awards') ? 'pass' : a === undefined ? 'pending' : awardsPass(a || 0, r.awards, r.awardsOut) ? 'pass' : 'fail';
  const all = [scores, awards, count('imdbv', r.imdbVotes, r.imdbVotesTo), count('malv', r.malVotes, r.malVotesTo)];
  return all.includes('fail') ? 'fail' : all.includes('pending') ? 'pending' : 'pass';
}

const save = (key: string, src: Got, score: number | null) => q.run(`insert into title_scores (key, source, score, checked_at) values (?, ?, ?, ?)
  on conflict (key, source) do update set score = excluded.score, checked_at = excluded.checked_at`, key, src, score, Date.now());
const num = (v: string | null | undefined) => { const n = v ? parseFloat(v) : NaN; return Number.isFinite(n) ? n : null; };
// one title's scores from the sources asked for (a TMDB title; anime ones by Fribb's Kitsu and MyAnimeList ids)
async function check(key: string, srcs: Got[]) {
  const [src, type, id] = key.split(':');
  if (src !== 'tmdb' || (type !== 'movie' && type !== 'tv')) { for (const s of srcs) await save(key, s, null); return; }
  if (srcs.some((s) => OMDB.includes(s) || s === 'awards')) {
    const imdb = (await tmdb<{ imdb_id?: string | null }>(`/${type}/${id}/external_ids`)).imdb_id;
    const o = imdb && srcs.some(usesOmdb) ? await omdbFor(imdb) : null;
    if (srcs.some((s) => OMDB.includes(s))) { await save(key, 'imdb', num(o?.imdb)); await save(key, 'rt', num(o?.rt)); await save(key, 'mc', num(o?.mc)); await save(key, 'imdbv', num(o?.votes?.replace(/,/g, ''))); }
    if (srcs.includes('awards')) await save(key, 'awards', await awardBits(imdb, o?.awards));
  }
  if (srcs.includes('mal') || srcs.includes('malv') || srcs.includes('kitsu')) {
    await loadFribb();
    const entries = type === 'tv' ? [...(fribb.byTmdb.get(Number(id)) || [])].sort((a, b) => (a.season || 99) - (b.season || 99) || a.offset - b.offset) : [];
    const k = type === 'tv' ? entries[0]?.kitsu : fribb.byMovie.get(Number(id));
    const m = type === 'tv' ? entries.find((e) => e.mal)?.mal : k ? fribb.map.get(k)?.mal : null;
    if (srcs.includes('kitsu')) await save(key, 'kitsu', k ? num((await kitsu<KitsuOne>(`/anime/${k}`)).data.attributes.averageRating as string | null | undefined) : null);
    if (srcs.includes('mal') || srcs.includes('malv')) {
      const got = m && env('MAL_CLIENT_ID') ? await mal<{ mean?: number; num_scoring_users?: number }>(`/anime/${m}?fields=mean,num_scoring_users`) : null;
      await save(key, 'mal', got?.mean ?? null); await save(key, 'malv', got?.num_scoring_users ?? null);
    }
  }
}

// the builder's preview: its first unknown candidates checked in the background (one run at a time, 40 titles, OMDb within the
// same allowance), so the count moves before the worker's next round
let warming = false;
export function warm(pool: string[], r: ScoreRule) {
  const need = needs(r), on = sourcesOn();
  if (warming || !need.length) return;
  warming = true;
  void (async () => {
    try {
      const used = (await q.one<{ n: number }>("select coalesce(sum(calls), 0)::int n from api_calls where day = ? and service = 'omdb'", localDay()))!.n;
      let omdbLeft = Math.max(0, Math.floor(OMDB_DAILY * 0.7) - used);
      const have = await known(pool);
      for (const key of pool.slice(0, 120).filter((k) => need.some((s) => on[s] && have.get(k)?.[s] === undefined)).slice(0, 40)) {
        const srcs = need.filter((s) => on[s] && (!usesOmdb(s) || omdbLeft > 0));
        if (!srcs.length) break;
        await check(key, srcs).catch((e) => console.error(`scores ${key}: ${e}`));
        if (srcs.some(usesOmdb)) omdbLeft--;
      }
    } finally { warming = false; }
  })();
}
// the worker: the lists with floors, their candidates' unknown scores checked (OMDb up to 70% of its day's allowance, the rest
// 120 titles a run), then those lists picked again
export async function checkDue(reselect: (listId: string) => Promise<unknown>) {
  const lists = await q.all<{ id: string; filters: ScoreRule }>("select id, filters from lists where kind = 'smart' and (filters->'ext' is not null or filters->'extTo' is not null or filters->'avg' is not null or filters->'imdbVotes' is not null or filters->'imdbVotesTo' is not null or filters->'malVotes' is not null or filters->'malVotesTo' is not null or filters->'avgTo' is not null or filters->'awards' is not null or filters->'awardsOut' is not null)");
  const work = new Map<string, Set<Got>>(), touched = new Map<string, Set<string>>();
  for (const l of lists) {
    const need = needs(l.filters), on = sourcesOn();
    if (!need.length) continue;
    const pool = (await q.one<{ v: { keys: string[] } }>('select v from meta where k = ?', `list-pool:${l.id}`))?.v.keys || [], have = await known(pool);
    for (const key of pool) for (const s of need) if (on[s] && have.get(key)?.[s] === undefined) {
      (work.get(key) || work.set(key, new Set()).get(key)!).add(s);
      (touched.get(l.id) || touched.set(l.id, new Set()).get(l.id)!).add(key);
    }
  }
  if (!work.size) return;
  const used = (await q.one<{ n: number }>("select coalesce(sum(calls), 0)::int n from api_calls where day = ? and service = 'omdb'", localDay()))!.n;
  let omdbLeft = Math.max(0, Math.floor(OMDB_DAILY * 0.7) - used), others = 120, done = 0;
  for (const [key, srcs] of work) {
    const all = [...srcs], needsOmdb = all.some(usesOmdb);
    const now = all.filter((s) => (usesOmdb(s) ? omdbLeft > 0 : others > 0));
    if (!now.length) continue;
    try { await check(key, now); done++; } catch (e) { console.error(`scores ${key}: ${e}`); }
    if (needsOmdb && now.some(usesOmdb)) omdbLeft--;
    if (now.some((s) => !usesOmdb(s))) others--;
    if (omdbLeft <= 0 && others <= 0) break;
  }
  for (const id of touched.keys()) await reselect(id).catch((e) => console.error(`list ${id}: ${e}`));
  if (done) console.log(`scores: ${done} titles checked for ${touched.size} lists`);
}
