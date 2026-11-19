// Per-title TMDB facts for the filters TMDB's search can't apply, kept 30 days (detail_cache facts:<key>); non-TMDB titles pass
import { q } from './db';
import { inParallel } from './poller';
import { tmdb } from './sources';
import { HOUR } from './util';

export type Facts = { movie: boolean; lang: string; lands: string[]; genres: number[]; keywords: number[]; companies: number[]; networks: number[]; cast: number[]; crew: number[];
  votes: number; runtime: number; self: number };
type Picked = { id: number; out?: boolean };
export type Asks = {
  languages?: string[]; countries?: string[]; countriesOut?: string[]; keywords?: Picked[]; companies?: Picked[]; networks?: number[];
  cast?: Picked[]; castMatch?: 'any' | 'all'; crew?: Picked[]; votes?: number; votesTo?: number; genres?: string[]; without?: string[];
};
type Raw = {
  original_language?: string; origin_country?: string[]; vote_count?: number; runtime?: number; genres?: { id: number }[]; production_companies?: { id: number }[];
  networks?: { id: number }[]; keywords?: { keywords?: { id: number }[]; results?: { id: number }[] }; credits?: { cast?: { id: number; character?: string }[]; crew?: { id: number }[] };
};
const STALE = 30 * 24 * HOUR;
const ids = (l?: { id: number }[]) => (l || []).map((x) => x.id);
const SELF = /^((him|her|them)?sel(f|ves)|narrator|host)\b/i;
// films' extra genres: stand-up comedy, concerts (main cast as themselves), shorts (under 40 minutes)
export const STANDUP = 'Stand-up comedy', CONCERTS = 'Concerts', SHORTS = 'Shorts', KIND_GENRES = [STANDUP, CONCERTS, SHORTS];
const short = (f: Facts) => f.runtime > 0 && f.runtime < 40, self = (f: Facts) => f.self >= 0.5 && !f.genres.includes(99);
const KINDS: [string, (f: Facts) => boolean][] = [[STANDUP, (f) => self(f) && f.genres.includes(35) && !f.genres.includes(10402) && !short(f)],
  [CONCERTS, (f) => self(f) && f.genres.includes(10402)], [SHORTS, short]];
const asksKinds = (a: Asks) => [...a.genres || [], ...a.without || []].some((g) => KIND_GENRES.includes(g));

export const asksFacts = (a: Asks) => !!(a.languages?.length || a.countries?.length || a.countriesOut?.length || a.keywords?.length || a.companies?.length || a.networks?.length
  || a.cast?.length || a.crew?.length || a.votes || a.votesTo || asksKinds(a));

export async function factsOf(keys: string[]) {
  const out = new Map<string, Facts>(), tmdbKeys = keys.filter((k) => /^tmdb:(movie|tv):\d+$/.test(k));
  for (const r of await q.all<{ key: string; value: Facts }>('select key, value from detail_cache where key = any(?) and at > ?', tmdbKeys.map((k) => `facts:${k}`), Date.now() - STALE))
    if ('self' in r.value) out.set(r.key.slice(6), r.value);   // older entries: asked again
  await inParallel(tmdbKeys.filter((k) => !out.has(k)), 8, async (key) => {
    const [, type, id] = key.split(':');
    const d = await tmdb<Raw>(`/${type}/${id}?append_to_response=keywords,credits`).catch(() => null);
    if (!d) return;
    const top = (d.credits?.cast || []).slice(0, 10);
    const f: Facts = { movie: type === 'movie', lang: d.original_language || '', lands: d.origin_country || [], genres: ids(d.genres), keywords: ids(d.keywords?.keywords || d.keywords?.results),
      companies: ids(d.production_companies), networks: ids(d.networks), cast: ids(d.credits?.cast), crew: ids(d.credits?.crew), votes: d.vote_count || 0,
      runtime: d.runtime || 0, self: top.length ? top.filter((c) => SELF.test((c.character || '').trim())).length / top.length : 0 };
    out.set(key, f);
    await q.run(`insert into detail_cache (key, at, value) values (?, ?, ?::jsonb) on conflict (key) do update set at = excluded.at, value = excluded.value`,
      `facts:${key}`, Date.now(), JSON.stringify(f));
  });
  return out;
}

// whether a title's facts fit the list
export function fits(a: Asks, f: Facts | undefined) {
  if (!f) return true;
  const any = (l: number[], p?: Picked[]) => { const inc = (p || []).filter((x) => !x.out); return !inc.length || inc.some((x) => l.includes(x.id)); };
  const none = (l: number[], p?: Picked[]) => !(p || []).some((x) => x.out && l.includes(x.id));
  const cast = (a.cast || []).filter((x) => !x.out);
  return (!a.languages?.length || a.languages.includes(f.lang)) && (!a.countries?.length || f.lands.some((c) => a.countries!.includes(c)))
    && !a.countriesOut?.some((c) => f.lands.includes(c))
    && any(f.keywords, a.keywords) && none(f.keywords, a.keywords) && any(f.companies, a.companies) && none(f.companies, a.companies)
    && (!a.networks?.length || a.networks.some((n) => f.networks.includes(n)))
    && (!cast.length || (a.castMatch === 'all' ? cast.every((x) => f.cast.includes(x.id)) : cast.some((x) => f.cast.includes(x.id)))) && none(f.cast, a.cast)
    && any(f.crew, a.crew) && none(f.crew, a.crew)
    && (!a.votes || f.votes >= a.votes) && (!a.votesTo || f.votes <= a.votesTo)
    && (!f.movie || KINDS.every(([g, is]) => (!a.genres?.includes(g) || is(f)) && (!a.without?.includes(g) || !is(f))));
}
