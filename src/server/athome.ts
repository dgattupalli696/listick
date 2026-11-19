// Latest releases: films out at home lately, each with its first day at home
// - 4K disc, Blu-ray: blu-ray.com's feed (bluray.ts)
// - digital: TMDB's digital release date in the list's country, else anywhere
// - streaming: on a subscription there now, dated by the day its search first found it (meta 'home-arrive'), else its digital day
// - films first out in the year and a half before; cinema: a theatrical release anywhere
// Kept: meta 'home-digital', 'home-first', 'home-cinema'
import { discs } from './bluray';
import { inParallel } from './poller';
import { tmdb } from './sources';
import { metaGet, metaSet } from './store';
import { fromTmdb, saveTitles } from './titles';
import type { TmdbPage } from './types';

export type Home = 'uhd' | 'bluray' | 'digital' | 'streaming';
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
type Dates = { results?: { iso_3166_1: string; release_dates: { type: number; release_date: string }[] }[] };

// a discover query's titles over its first pages: TMDB id -> title key
async function discover(path: string, pages: number, type: 'movie' | 'tv' = 'movie') {
  const first = await tmdb<TmdbPage & { total_pages?: number }>(`${path}&page=1`).catch(() => null);
  const rest = await Promise.all(Array.from({ length: Math.min(pages, first?.total_pages || 1) - 1 }, (_, i) => tmdb<TmdbPage>(`${path}&page=${i + 2}`).then((d) => d.results, () => [])));
  // with a poster only
  const seen = new Set<number>(), films = [first?.results || [], ...rest].flat().filter((x) => x.poster_path && !seen.has(x.id) && seen.add(x.id));
  const saved = await saveTitles(films.map(fromTmdb(type)));
  return new Map(films.map((x, i) => [x.id, saved[i].key]));
}

export async function homeReleases(region: string, kinds: Home[], withinDays: number, cinema: boolean, filter = new URLSearchParams()) {
  const now = Date.now(), since = now - withinDays * DAY, out = new Map<string, number>();
  const found: [string, number][] = [];   // title key, day at home
  const datesGot = new Map<number, Promise<Dates | null>>();
  const dates = (id: number) => { if (!datesGot.has(id)) datesGot.set(id, tmdb<Dates>(`/movie/${id}/release_dates`).catch(() => null)); return datesGot.get(id)!; };
  if (kinds.includes('uhd') || kinds.includes('bluray'))
    for (const d of await discs()) if (d.key && kinds.includes(d.uhd ? 'uhd' : 'bluray') && (d.year || 0) >= new Date(d.date - 548 * DAY).getUTCFullYear()) found.push([d.key, d.date]);
  // the list's filters, each way's window and order
  const search = (set: Record<string, string>) => { const p = new URLSearchParams(filter); for (const [k, v] of Object.entries(set)) p.set(k, v); return `/discover/movie?${p}`; };
  const made = { 'primary_release_date.gte': iso(since - 548 * DAY), sort_by: 'popularity.desc', include_adult: 'false' };
  const paths = [kinds.includes('digital') ? search({ ...made, region, with_release_type: '4', 'release_date.gte': iso(since), 'release_date.lte': iso(now) }) : null,
    kinds.includes('streaming') ? search({ ...made, watch_region: region, with_watch_monetization_types: filter.get('with_watch_monetization_types') || 'flatrate',
      'primary_release_date.lte': iso(now) }) : null].filter((p) => p !== null);
  if (paths.length) {
    const got = await Promise.all(paths.map((p) => discover(p, 25))), digital = new Map(got.flatMap((m) => [...m]));
    // first day each search found each film (0: there at its first run); searches unused for 30 days dropped
    const arrived = new Map<number, number>();
    if (kinds.includes('streaming')) {
      const u = new URL(paths.at(-1)!, 'https://x');
      u.searchParams.delete('primary_release_date.gte'); u.searchParams.delete('primary_release_date.lte'); u.searchParams.sort();
      const all = (await metaGet<Record<string, { at: number; used?: number; seen: Record<string, number> }>>('home-arrive')) || {};
      for (const [k, v] of Object.entries(all)) if (now - (v.used || v.at) > 30 * DAY) delete all[k];
      const a = all[u.search] ||= { at: now, used: now, seen: {} }, start = a.at === now;
      a.used = now;
      for (const id of got.at(-1)!.keys()) { if (!(id in a.seen)) a.seen[id] = start ? 0 : now; if (a.seen[id]) arrived.set(id, a.seen[id]); }
      await metaSet('home-arrive', all);
    }
    // new discs of films out on digital before
    const discOnly = new Set<number>();
    for (const [key, at] of found) {
      const id = Number(key.split(':')[2]);
      if (key.startsWith('tmdb:movie:') && at >= since && !digital.has(id)) { digital.set(id, key); discOnly.add(id); }
    }
    const known = (await metaGet<Record<string, number>>('home-digital')) || {};
    const first = (await metaGet<Record<string, { at: number; checked: number }>>('home-first')) || {};
    let added = false, addedFirst = false;
    await inParallel([...digital], 8, async ([id, key]) => {
      const k = `${id}:${region}`;
      if (!known[k] && !(first[k] && now - first[k].checked < 7 * DAY)) {
        const r = await dates(id), days = (c?: string, type?: number) => (r?.results || [])
          .filter((g) => !c || g.iso_3166_1 === c).flatMap((g) => g.release_dates).filter((d) => !type || d.type === type).map((d) => Date.parse(d.release_date)).filter((t) => t <= now);
        const at = Math.min(...(days(region, 4).length ? days(region, 4) : days(undefined, 4)));
        if (Number.isFinite(at)) { known[k] = at; added = true; delete first[k]; }
        else if (r) { const any = Math.min(...days()); if (Number.isFinite(any)) { first[k] = { at: any, checked: now }; addedFirst = true; } }
      }
      // arrival day (with rent or buy asked too: the earliest)
      if (arrived.has(id)) found.push([key, arrived.get(id)!]);
      if (arrived.has(id) && !kinds.includes('digital')) return;
      if (known[k]) found.push([key, known[k]]);
      else if (first[k] && kinds.includes('streaming') && !discOnly.has(id)) found.push([key, first[k].at]);
    });
    if (added) await metaSet('home-digital', known);
    if (addedFirst || added) await metaSet('home-first', first);
  }
  // first day at home
  const day = new Map<string, number>();
  for (const [key, at] of found) if (at <= now && at < (day.get(key) ?? Infinity)) day.set(key, at);
  const recent = [...day].filter(([, at]) => at >= since);
  let shown: Set<string> | null = null;
  if (cinema) {
    const was = (await metaGet<Record<string, boolean>>('home-cinema')) || {};
    let added = false;
    await inParallel(recent.map(([key]) => key), 8, async (key) => {
      const id = Number(key.split(':')[2]);
      if (!key.startsWith('tmdb:movie:') || was[id] !== undefined) return;
      const r = await dates(id);
      if (r) { was[id] = (r.results || []).some((g) => g.release_dates.some((d) => d.type === 2 || d.type === 3)); added = true; }
    });
    if (added) await metaSet('home-cinema', was);
    shown = new Set(found.map(([key]) => key).filter((key) => was[Number(key.split(':')[2])]));
  }
  for (const [key, at] of recent) if (!shown || shown.has(key)) out.set(key, at);
  return out;
}

// Latest shows: new ones by their first episode, returning ones by their latest season's first episode (meta 'home-seasons';
// entries unchecked for 60 days dropped)
export type Airing = 'new' | 'returning';
export async function showReleases(kinds: Airing[], withinDays: number, filter = new URLSearchParams()) {
  const now = Date.now(), since = now - withinDays * DAY, out = new Map<string, number>();
  const search = (set: Record<string, string>) => { const p = new URLSearchParams(filter); for (const [k, v] of Object.entries(set)) p.set(k, v); return `/discover/tv?${p}`; };
  const base = { sort_by: 'popularity.desc', include_adult: 'false' };
  if (kinds.includes('new')) {
    const path = search({ ...base, 'first_air_date.gte': iso(since), 'first_air_date.lte': iso(now) });
    const first = await tmdb<TmdbPage & { total_pages?: number }>(`${path}&page=1`).catch(() => null);
    const rest = await Promise.all(Array.from({ length: Math.min(10, first?.total_pages || 1) - 1 }, (_, i) => tmdb<TmdbPage>(`${path}&page=${i + 2}`).then((d) => d.results, () => [])));
    const shows = [first?.results || [], ...rest].flat().filter((x) => x.poster_path), saved = await saveTitles(shows.map(fromTmdb('tv')));
    shows.forEach((x, i) => { const at = Date.parse(x.first_air_date || ''); if (at >= since && at <= now) out.set(saved[i].key, at); });
  }
  if (kinds.includes('returning')) {
    const airing = await discover(search({ ...base, 'air_date.gte': iso(since), 'air_date.lte': iso(now), 'first_air_date.lte': iso(since - DAY) }), 15, 'tv');
    const kept = (await metaGet<Record<string, { at: number; checked: number }>>('home-seasons')) || {};
    let added = false;
    await inParallel([...airing], 8, async ([id, key]) => {
      const k = String(id), c = kept[k];
      if (!c || (c.at < since && now - c.checked > DAY)) {
        const d = await tmdb<{ seasons?: { season_number: number; air_date: string | null }[] }>(`/tv/${id}`).catch(() => null);
        const days = (d?.seasons || []).filter((x) => x.season_number > 0 && x.air_date).map((x) => Date.parse(x.air_date!)).filter((t) => t <= now);
        if (d) { kept[k] = { at: days.length ? Math.max(...days) : 0, checked: now }; added = true; }
      }
      if (kept[k] && kept[k].at >= since) out.set(key, kept[k].at);
    });
    for (const [k, v] of Object.entries(kept)) if (now - v.checked > 60 * DAY) { delete kept[k]; added = true; }
    if (added) await metaSet('home-seasons', kept);
  }
  return out;
}
