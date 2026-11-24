'use client';
// smart list builder + filter chips
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { PkBtn } from './Cards';
import { Drop } from './Drop';
import { getJ, postJ } from './lib/api';
import { say } from './lib/format';
import { Icon, PATHS } from './lib/icons';
import { guessCountry, type Country, type Prefs, type RegionInfo } from './lib/region';
import { SearchPick, type Picked } from './SearchPick';
import { Slider } from './Slider';
import { serviceName } from '@/lib/services';

export type Media = 'movie' | 'tv' | 'anime' | 'animefilm' | 'both';
export type Filters = {
  sort?: 'popular' | 'rating' | 'newest' | 'oldest' | 'az' | 'box' | 'votes' | 'shuffle' | 'release' | 'releaseOld'; max?: number; refresh?: '6h' | '12h' | 'daily' | 'weekly' | 'never'; row?: boolean;
  home?: ('uhd' | 'bluray' | 'digital' | 'streaming')[]; homeWithin?: number; homeCinema?: boolean; airing?: ('new' | 'returning')[];
  genres?: string[]; without?: string[]; match?: 'any' | 'all';
  when?: 'any' | '30d' | '6m' | 'year' | 'next3' | 'years' | 'season' | 'lastSeason' | 'nextSeason'; yearFrom?: number; yearTo?: number; decades?: number[];
  runtimeFrom?: number; runtimeTo?: number; released?: 'out' | 'coming' | 'both'; cert?: string; certs?: string[]; tvCerts?: string[]; out?: ('cinema' | 'digital' | 'disc' | 'tv')[]; status?: number[]; type?: number[];
  scoreFrom?: number; scoreTo?: number; votes?: number; votesTo?: number; region?: string; reach?: 'released' | 'streaming' | 'anywhere'; services?: (number | string)[]; my?: boolean;
  watch?: Watch[]; tvdbGenre?: number; servicesOut?: number[];
  language?: string; country?: string; languages?: string[]; countries?: string[]; languagesOut?: string[]; countriesOut?: string[];
  mood?: string; keywords?: Picked[]; kwMatch?: 'any' | 'all'; collection?: 'in' | 'out' | 'first' | 'later'; trailer?: boolean; cast?: Picked[]; castMatch?: 'any' | 'all'; crew?: Picked[]; companies?: Picked[]; networks?: (number | Picked)[];
  hideWatched?: boolean; hidePlan?: boolean; onlyRated?: boolean; myFrom?: number; myTo?: number; watched?: 'year' | 'old' | 'started';
  // other sources' floors and ceilings (checked title by title, scores.ts), their average (0-100), all or any of them, and a
  // source with no score: out or kept
  ext?: Partial<Record<Src, number>>; extTo?: Partial<Record<Src, number>>; avg?: number; avgTo?: number; meet?: 'all' | 'any'; missing?: 'out' | 'keep';
  imdbVotes?: number; imdbVotesTo?: number; malVotes?: number; malVotesTo?: number;
  awards?: string[]; awardsOut?: string[];   // '<award>-won' | '<award>-nom'
  // films: franchises in (the list is made of them) or out, budget and box office floors (USD), TMDB's status
  collections?: Picked[]; budgetFrom?: number; revenueFrom?: number; movieStatus?: string[];
};
export type Src = 'imdb' | 'rt' | 'mc' | 'mal' | 'kitsu';
const AWARDS: [string, string][] = [['oscar-won', 'Oscar winner'], ['oscar-nom', 'Oscar nominee'], ['emmy-won', 'Emmy winner'], ['emmy-nom', 'Emmy nominee'],
  ['globe-won', 'Golden Globe winner'], ['globe-nom', 'Golden Globe nominee'], ['bafta-won', 'BAFTA winner'], ['bafta-nom', 'BAFTA nominee'],
  ['cannes-won', 'Palme d’Or winner'], ['cannes-nom', 'In competition at Cannes'], ['picture-won', 'Best Picture winner'], ['picture-nom', 'Best Picture nominee'],
  ['razzie-won', 'Razzie winner'], ['razzie-nom', 'Razzie nominee'], ['any-won', 'Won any award'], ['any-nom', 'Nominated for any award']];
const MOVIE_STATUS: [string, string][] = [['Released', 'Released'], ['Post Production', 'Post production'], ['In Production', 'In production'], ['Planned', 'Planned'],
  ['Rumored', 'Rumored'], ['Canceled', 'Canceled']];
const MONEY: [number, string][] = [[0, 'Any'], ...[1, 5, 10, 25, 50, 100, 200, 500].map((m): [number, string] => [m * 1e6, `$${m}M+`]), [1e9, '$1B+']];
const COLLECTION: [NonNullable<Filters['collection']>, string][] = [['in', 'In a collection'], ['first', 'First in its collection'], ['later', 'A sequel in a collection'], ['out', 'Not in a collection']];
type Watch = 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';
export const DIGITAL: Watch[] = ['flatrate', 'free', 'ads', 'rent', 'buy'];
// Available as: two ways, each TMDB's monetization types (a circle is on when any of its types is)
const WAYS: [Watch[], string, string][] = [[['flatrate', 'free', 'ads'], 'Streaming', 'M4 6h16v10H4zM8 20h8M12 16v4M10 8.5v5l4-2.5z'],
  [['rent', 'buy'], 'Rent or buy', 'M12 4v11M7 10l5 5 5-5M5 20h14']];
export type Draft = { id?: string; name: string; description: string; media: Media; filters: Filters; shared?: boolean };

export const KIND: Record<Media, [string, string]> = { movie: ['Movies', PATHS.movie], tv: ['Shows', PATHS.tv], anime: ['Anime series', PATHS.anime],
  animefilm: ['Anime movies', PATHS.anime], both: ['Movies & shows', 'M2 6h11v10H2zM11 9h11v10H11z'] };
const year = new Date().getFullYear();
export const ICON = { smart: 'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  share: 'M18 8a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4' };

// a smart list's settings under its name: each its group's icon (the kind's own) and words, a left-out one red with a minus,
// the order last in the accent
const ORDER_ICON = 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4', MINUS = 'M6 12h12';
export function Chips({ media, f }: { media: Media; f: Filters }) {
  const chips = describe(media, f, { lang: langName, land: landName });
  return (
    <div className="l-fchips">
      {chips.map(([g, t, , no], i) => <span key={i} className={no ? 'no' : undefined}><Icon d={no ? MINUS : i === 0 ? KIND[media][1] : GROUP_ICON[g]} size={13} width={2} />{t}</span>)}
      <span className="ord"><Icon d={ORDER_ICON} size={13} width={2} />{ORDER_NAME[f.sort || 'popular']}</span>
    </div>
  );
}

// the smart list builder, a sheet over the page: the name as its title, a strip of what's set (each with its ×), then the
// groups on the left (each with how many of its settings are on), the open group's settings (dropdowns, the kind circles, the
// genre chips, the country's services, switches) and a live preview (the titles the list will hold). A list has its own
// country, starting with yours
// the builder's flow: General (watch country, kind, new releases, order), the filters, then the list's own settings
const GROUPS = [['basics', 'General', 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6'], ['genres', 'Genres', 'M5 4v16M9 4v16M13 5l4 15M19 4v16'], ['release', 'Release', PATHS.cal],
  ['scores', 'Scores', PATHS.star], ['streaming', 'Where to watch', 'M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3zM13 4v16'], ['language', 'Language', PATHS.globe],
  ['people', 'People & studios', PATHS.people], ['list', 'List', PATHS.lists]] as const;
type Group = (typeof GROUPS)[number][0];
const GROUP_ICON = Object.fromEntries(GROUPS.map(([k, , ic]) => [k, ic])) as Record<Group, string>;
// lists made from somewhere else than TMDB's search: your library, New releases / New on TV, franchises
const libraryOnly = (f: Filters) => !!(f.home?.length || f.airing?.length || f.myFrom || f.myTo || f.watched || f.collections?.some((x) => !x.out));
// the last New releases circle off takes its settings and its own orders with it
// the first circle on clears Release date's other dates
const NO_WHEN: Partial<Filters> = { when: undefined, yearFrom: undefined, yearTo: undefined };
const homePatch = (f: Filters, home: NonNullable<Filters['home']>): Partial<Filters> => (home.length ? { home, ...(f.home?.length ? {} : NO_WHEN) }
  : { home: undefined, homeWithin: undefined, homeCinema: undefined, ...(f.sort === 'release' || f.sort === 'releaseOld' ? { sort: undefined } : {}) });
const airingPatch = (f: Filters, airing: NonNullable<Filters['airing']>): Partial<Filters> => (airing.length ? { airing, ...(f.airing?.length ? {} : NO_WHEN) }
  : { airing: undefined, homeWithin: undefined, ...(f.sort === 'release' || f.sort === 'releaseOld' ? { sort: undefined } : {}) });
const names = (type: 'language' | 'region') => { try { return new Intl.DisplayNames(['en'], { type }); } catch { return null; } };
const LANG = names('language'), LAND = names('region');
const langName = (l: string) => LANG?.of(l) || l, landName = (c: string) => LAND?.of(c) || c;
const some = <T,>(a: T[]) => (a.length ? a : undefined);
// a country's services, one each: add-on channels left out, plans merged
function servicesOf(list: { id: number; name: string }[]) {
  const by = new Map<string, { name: string; ids: number[] }>();
  for (const x of list) {
    const name = serviceName(x.name);
    if (!name) continue;
    const g = by.get(name.toLowerCase());
    if (g) g.ids.push(x.id); else by.set(name.toLowerCase(), { name, ids: [x.id] });
  }
  return [...by.values()];
}
// Include and Exclude dropdowns
function InOut<T extends string | number>({ label, opts, ins, outs, set, search }: { label: string; opts: [T, string][]; ins: T[]; outs: T[]; set: (ins: T[], outs: T[]) => void; search?: boolean }) {
  return (
    <div className="b-sec"><span className="dd-l">{label}</span><div className="b-dds">
      <Drop label="Include" multi search={search} empty="Any" opts={opts} value={ins} set={(v) => set(v, outs.filter((x) => !v.includes(x)))} />
      <Drop label="Exclude" multi search={search} empty="None" opts={opts} value={outs} set={(v) => set(ins.filter((x) => !v.includes(x)), v)} />
    </div></div>
  );
}
// Include and Exclude searches (keywords, people, studios)
function InOutSearch({ kind, label, value, set }: { kind: 'keyword' | 'person' | 'company' | 'network' | 'collection'; label: string; value: Picked[]; set: (v: Picked[] | undefined) => void }) {
  const ins = value.filter((x) => !x.out), outs = value.filter((x) => x.out), not = (l: Picked[]) => (x: Picked) => !l.some((y) => y.id === x.id);
  return (
    <div className="b-sec"><span className="dd-l">{label}</span><div className="b-dds">
      <SearchPick kind={kind} label="Include" value={ins} set={(v) => set(some([...v.map((x) => ({ ...x, out: undefined })), ...outs.filter(not(v))]))} />
      <SearchPick kind={kind} label="Exclude" value={outs} set={(v) => set(some([...ins.filter(not(v)), ...v.map((x) => ({ ...x, out: true }))]))} />
    </div></div>
  );
}
const ORDER_NAME: Record<NonNullable<Filters['sort']>, string> = { popular: 'Popular first', rating: 'Top rated first', newest: 'Newest first', oldest: 'Oldest first',
  az: 'A–Z', box: 'Box office first', votes: 'Most voted first', shuffle: 'Shuffled', release: 'Newest release first', releaseOld: 'Oldest release first' };
type Desc = [Group, string, Partial<Filters> | null, boolean?];
// older lists' Available Streaming: Available as Subscription
const tidy = (f: Filters): Filters => (f.reach === 'streaming' ? { ...f, reach: undefined, watch: f.watch?.length ? f.watch : ['flatrate'] } : f);
// what a smart list has set, in the builder's groups: each with what clearing it sets (null: it can't be cleared) and whether it
// leaves something out; the builder's strip and the list page's chips. svc: a service's name (without it, services are counted)
function describe(media: Media, f: Filters, n: { svc?: (id: number | string) => string; lang: (l: string) => string; land: (c: string) => string }): Desc[] {
  const films = media === 'movie' || media === 'animefilm' || media === 'both', shows = media === 'tv' || media === 'anime' || media === 'both';
  const when = f.when || (f.yearFrom || f.yearTo ? 'years' : 'any'), picked = (f.services || []).filter((x): x is number => typeof x === 'number');
  const langs = f.languages?.length ? f.languages : f.language ? [f.language] : [], lands = f.countries?.length ? f.countries : f.country ? [f.country] : [];
  const D = (g: Group, t: string, patch: Partial<Filters> | null, no?: boolean): Desc => [g, t, patch, no];
  const names = (v: number[]) => [...new Set(v.map((id) => n.svc!(id)))];
  const lib = libraryOnly(f), home = !!(f.home?.length || f.airing?.length), svcs = !lib || home;
  const drop = (l: Partial<Record<Src, number>> | undefined, k: Src) => { const e = { ...l, [k]: undefined }; return Object.values(e).some(Boolean) ? e : undefined; };
  return [
    D('basics', KIND[media][0], null),
    // older lists' Available: Streaming
    ...((!lib || f.airing?.length) && f.reach === 'streaming' && !f.watch?.length ? [D('streaming', 'Streaming', { reach: undefined })] : []),
    ...(!lib && films && f.reach === 'released' ? [D('release', 'Released in watch country', { reach: undefined })] : []),
    ...(f.row ? [D('list', 'On Home', { row: undefined })] : []),
    ...homeChips(f.home || []).map(([ks, nm]) => D('basics', `New: ${nm}`, homePatch(f, f.home!.filter((y) => !ks.includes(y))))),
    ...(f.airing || []).map((x) => D('basics', `New: ${label(AIRING.map(([v, nm]) => [v, nm] as [string, string]), x)}`, airingPatch(f, f.airing!.filter((y) => y !== x)))),
    ...(home ? [D('release', label(WITHIN, f.homeWithin || 90), f.homeWithin ? { homeWithin: undefined } : null)] : []),
    ...(f.home?.length && f.homeCinema ? [D('basics', 'From cinemas', { homeCinema: undefined })] : []),
    ...(f.mood ? [D('genres', label(MOODS.map(([v, nm]) => [v, nm] as [string, string]), f.mood), unmood(f.mood))] : []),
    ...(media === 'tv' && f.tvdbGenre ? [D('genres', `${label(TVDB_CATS, f.tvdbGenre)} · TheTVDB`, { tvdbGenre: undefined })] : []),
    ...(f.genres || []).map((g) => D('genres', g, { genres: f.genres!.filter((x) => x !== g) })),
    ...(f.without || []).map((g) => D('genres', g, { without: f.without!.filter((x) => x !== g) }, true)),
    ...(f.match === 'all' && (f.genres || []).length > 1 ? [D('genres', 'All genres', { match: undefined })] : []),
    ...(f.keywords || []).map((k) => D('genres', k.name, { keywords: f.keywords!.filter((x) => x.id !== k.id) }, k.out)),
    ...(f.kwMatch === 'all' && (f.keywords || []).filter((k) => !k.out).length > 1 ? [D('genres', 'All keywords', { kwMatch: undefined })] : []),
    ...(when === 'years' && (f.yearFrom || f.yearTo) ? [D('release', `${f.yearFrom || '…'}–${f.yearTo || '…'}`, { when: undefined, yearFrom: undefined, yearTo: undefined })] : []),
    ...(when !== 'any' && when !== 'years' ? [D('release', label(ANIME_WHEN, when), { when: undefined })] : []),
    ...(f.decades || []).map((x) => D('release', label(DECADES, x), { decades: f.decades!.filter((y) => y !== x) })),
    ...(films && !lib ? (f.out || []).map((x) => D('release', label(OUT, x), { out: f.out!.filter((y) => y !== x) })) : []),
    ...(shows && !lib ? (f.status || []).map((x) => D('release', label(STATUS, x), { status: f.status!.filter((y) => y !== x) })) : []),
    ...(shows && !lib ? (f.type || []).map((x) => D('release', label(TV_TYPE, x), { type: f.type!.filter((y) => y !== x) })) : []),
    ...(!lib && f.released && f.released !== 'both' ? [D('release', f.released === 'out' ? 'Already out' : 'Upcoming', { released: undefined })] : []),
    ...(f.runtimeFrom || f.runtimeTo ? [D('release', range(f.runtimeFrom, f.runtimeTo, ' min'), { runtimeFrom: undefined, runtimeTo: undefined })] : []),
    ...(films && f.collection ? [D('release', label(COLLECTION, f.collection), { collection: undefined }, f.collection === 'out')] : []),
    ...(f.trailer ? [D('release', 'Has a trailer', { trailer: undefined })] : []),
    ...(films ? (f.collections || []).map((k) => D('release', k.name, { collections: some(f.collections!.filter((x) => x.id !== k.id)) }, k.out)) : []),
    ...(films ? (f.movieStatus || []).map((x) => D('release', label(MOVIE_STATUS, x), { movieStatus: some(f.movieStatus!.filter((y) => y !== x)) })) : []),
    ...(films && f.budgetFrom ? [D('release', `Budget ${label(MONEY, f.budgetFrom)}`, { budgetFrom: undefined })] : []),
    ...(films && f.revenueFrom ? [D('release', `Box office ${label(MONEY, f.revenueFrom)}`, { revenueFrom: undefined })] : []),
    ...(films && (!lib || home) && f.cert ? [D('list', `Up to ${f.cert}`, { cert: undefined })] : []),
    ...(films && (!lib || home) ? (f.certs || []).map((c) => D('list', c, { certs: some(f.certs!.filter((x) => x !== c)) })) : []),
    ...(shows && (!lib || home) ? (f.tvCerts || []).map((c) => D('list', c, { tvCerts: some(f.tvCerts!.filter((x) => x !== c)) })) : []),
    ...(f.scoreFrom || f.scoreTo ? [D('scores', `TMDB ${range(f.scoreFrom, f.scoreTo)}`, { scoreFrom: undefined, scoreTo: undefined })] : []),
    ...(f.votes || f.votesTo ? [D('scores', `${f.votes && f.votesTo ? `${votesText(f.votes)}–${votesText(f.votesTo)}` : f.votes ? `${votesText(f.votes)}+` : `up to ${votesText(f.votesTo!)}`} votes`,
      { votes: undefined, votesTo: undefined })] : []),
    ...SOURCES.filter(([k]) => f.ext?.[k] || f.extTo?.[k]).map(([k, nm, , unit]) => D('scores', `${nm} ${range(f.ext?.[k], f.extTo?.[k], unit)}`, { ext: drop(f.ext, k), extTo: drop(f.extTo, k) })),
    ...(f.avg || f.avgTo ? [D('scores', `Average ${range(f.avg, f.avgTo)}`, { avg: undefined, avgTo: undefined })] : []),
    ...(f.imdbVotes || f.imdbVotesTo ? [D('scores', `IMDb votes ${votesRange(f.imdbVotes, f.imdbVotesTo)}`, { imdbVotes: undefined, imdbVotesTo: undefined })] : []),
    ...(f.malVotes || f.malVotesTo ? [D('scores', `MAL votes ${votesRange(f.malVotes, f.malVotesTo)}`, { malVotes: undefined, malVotesTo: undefined })] : []),
    ...(f.awards || []).map((a) => D('scores', label(AWARDS, a), { awards: some(f.awards!.filter((x) => x !== a)) })),
    ...(f.awardsOut || []).map((a) => D('scores', label(AWARDS, a), { awardsOut: some(f.awardsOut!.filter((x) => x !== a)) }, true)),
    ...(!svcs ? [] : f.my ? [D('streaming', 'My services', { my: undefined })] : n.svc ? names(picked).map((nm) => D('streaming', nm, { services: picked.filter((x) => n.svc!(x) !== nm) }))
      : picked.length ? [D('streaming', `${picked.length} service${picked.length > 1 ? 's' : ''}`, null)] : []),
    ...(svcs && n.svc ? names(f.servicesOut || []).map((nm) => D('streaming', nm, { servicesOut: some(f.servicesOut!.filter((x) => n.svc!(x) !== nm)) }, true)) : []),
    ...(svcs ? WAYS.filter(([ws]) => ws.some((w) => f.watch?.includes(w))).map(([ws, nm]) => D('streaming', nm, { watch: some(f.watch!.filter((x) => !ws.includes(x))) })) : []),
    ...(shows ? netsOf(f.networks).map((k) => D('streaming', k.name, { networks: some(netsOf(f.networks).filter((x) => x.id !== k.id)) }, k.out)) : []),
    ...langs.map((l) => D('language', n.lang(l), { language: undefined, languages: langs.filter((x) => x !== l) })),
    ...(f.languagesOut || []).map((l) => D('language', n.lang(l), { languagesOut: f.languagesOut!.filter((x) => x !== l) }, true)),
    ...lands.map((c) => D('language', `Made in ${n.land(c)}`, { country: undefined, countries: lands.filter((x) => x !== c) })),
    ...(f.countriesOut || []).map((c) => D('language', `Made in ${n.land(c)}`, { countriesOut: f.countriesOut!.filter((x) => x !== c) }, true)),
    ...(films ? (f.cast || []).map((k) => D('people', k.name, { cast: f.cast!.filter((x) => x.id !== k.id) }, k.out)) : []),
    ...(films ? (f.crew || []).map((k) => D('people', k.name, { crew: f.crew!.filter((x) => x.id !== k.id) }, k.out)) : []),
    ...(f.companies || []).map((k) => D('people', k.name, { companies: f.companies!.filter((x) => x.id !== k.id) }, k.out)),
    ...(f.hideWatched ? [D('list', 'Hide watched', { hideWatched: undefined })] : []),
    ...(f.hidePlan ? [D('list', 'Hide Plan to watch', { hidePlan: undefined })] : []),
    ...(f.onlyRated ? [D('list', 'Only rated', { onlyRated: undefined })] : []),
    ...(f.myFrom || f.myTo ? [D('basics', `My rating ${range(f.myFrom, f.myTo)}`, { myFrom: undefined, myTo: undefined })] : []),
    ...(f.watched ? [D('basics', label(WATCHED, f.watched), { watched: undefined })] : []),
  ];
}
export const Sw = ({ on, set, label }: { on: boolean; set: (x: boolean) => void; label: string }) => (
  <button type="button" className={`l-sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)} />);
const SwitchRow = ({ label, on, set }: { label: string; on: boolean; set: (x: boolean) => void }) => <div className="b-line"><span>{label}</span><Sw on={on} set={set} label={label} /></div>;
const YEARS: [number, string][] = Array.from({ length: year + 3 - 1900 }, (_, i) => year + 2 - i).map((y) => [y, String(y)]);
const WHEN: [NonNullable<Filters['when']>, string][] = [['any', 'Any time'], ['30d', 'Last 30 days'], ['6m', 'Last 6 months'], ['year', 'This year'], ['next3', 'Next 3 months'], ['years', 'Pick years']];
// anime's seasons (calendar quarters), named as now: "This season · Fall 2026"
const seasonName = (by: number) => { const n = new Date(), q = Math.floor(n.getMonth() / 3) + by, y = n.getFullYear() + Math.floor(q / 4);
  return `${['Winter', 'Spring', 'Summer', 'Fall'][((q % 4) + 4) % 4]} ${y}`; };
const ANIME_WHEN: [NonNullable<Filters['when']>, string][] = [['any', 'Any time'], ['season', `This season · ${seasonName(0)}`], ['lastSeason', `Last season · ${seasonName(-1)}`],
  ['nextSeason', `Next season · ${seasonName(1)}`], ...WHEN.slice(1)];
// the score sources a kind gets: MyAnimeList and Kitsu for anime only, no Rotten Tomatoes or Metacritic for anime series
const sourceFits = (m: Media, k: Src) => (m === 'anime' ? k !== 'rt' && k !== 'mc' : m === 'animefilm' ? true : k !== 'mal' && k !== 'kitsu');
const only = (l: Partial<Record<Src, number>> | undefined, m: Media) => { const e = Object.fromEntries(Object.entries(l || {}).filter(([k]) => sourceFits(m, k as Src)));
  return Object.keys(e).length ? e : undefined; };
const DISC = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z';
// New on TV: new, returning
const AIRING: ['new' | 'returning', string, string][] = [['new', 'New shows', 'M12 5v14M5 12h14'], ['returning', 'Returning', 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7']];
// New releases at home: Digital is rent or buy and subscription, narrowed by Available as; older lists may hold one of them
type HomeKind = NonNullable<Filters['home']>[number];
const HOME: [HomeKind[], string, string | ReactNode][] = [[['digital', 'streaming'], 'Digital', 'M4 6h16v10H4zM8 20h8M12 16v4M10 8.5v5l4-2.5z'],
  [['uhd'], '4K disc', <b key="4k" className="pk-4k">4K</b>], [['bluray'], 'Blu-ray', DISC]];
const HOME_NAME: Record<HomeKind, string> = { digital: 'Rent or buy', streaming: 'Subscription', uhd: '4K disc', bluray: 'Blu-ray' };
// a list's New release chips: Digital once when both are on
const homeChips = (home: HomeKind[]): [HomeKind[], string][] => [...(home.includes('digital') && home.includes('streaming') ? [[['digital', 'streaming'], 'Digital'] as [HomeKind[], string]] : []),
  ...home.filter((k) => !(home.includes('digital') && home.includes('streaming') && (k === 'digital' || k === 'streaming'))).map((k): [HomeKind[], string] => [[k], HOME_NAME[k]])];
const HOME_ORDER: [NonNullable<Filters['sort']>, string][] = [['release', 'Newest release'], ['releaseOld', 'Oldest release'], ['rating', 'Rating'], ['az', 'A–Z'],
  ['newest', 'Newest movie'], ['oldest', 'Oldest movie'], ['shuffle', 'Shuffle']];
// New releases / New on TV: how far back (Release date while they're on)
const WITHIN: [number, string][] = [[30, 'Last 30 days'], [90, 'Last 3 months'], [180, 'Last 6 months'], [365, 'Last year']];
const DECADES: [number, string][] = [[1950, '50s'], [1960, '60s'], [1970, '70s'], [1980, '80s'], [1990, '90s'], [2000, '2000s'], [2010, '2010s'], [2020, '2020s']];
const OUT: [NonNullable<Filters['out']>[number], string][] = [['cinema', 'In cinemas'], ['digital', 'On digital'], ['disc', 'On disc'], ['tv', 'On TV']];
const STATUS: [number, string][] = [[0, 'Returning'], [1, 'Planned'], [2, 'In production'], [3, 'Ended'], [4, 'Cancelled'], [5, 'Pilot']];
export const TVDB_CATS: [number, string][] = [[8, 'Game show'], [9, 'Food'], [25, 'Travel'], [7, 'Home and garden'], [23, 'Talk show'], [21, 'Sport'], [3, 'Reality'],
  [13, 'Documentary'], [1, 'Soap'], [36, 'Awards show'], [33, 'History'], [35, 'Martial arts'], [30, 'Podcast']];
const TV_TYPE: [number, string][] = [[4, 'Scripted'], [2, 'Miniseries'], [0, 'Documentary'], [3, 'Reality'], [5, 'Talk show'], [1, 'News'], [6, 'Video']];
const MINUTES: [number, string][] = [[0, 'Any'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [150, '2 h 30'], [180, '3 h'],
  [210, '3 h 30'], [240, '4 h'], [300, '5 h']];
// moods: genres (and keywords) filled in for you, to adjust afterwards (TMDB keyword ids)
const MOODS: [string, string, Partial<Filters>, string][] = [
  ['feel', 'Feel-good', { genres: ['Comedy', 'Family', 'Romance', 'Music'], without: ['Horror', 'War', 'Thriller', 'Crime'] }, 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM8 14c2 2 6 2 8 0M9 9h.01M15 9h.01'],
  ['dark', 'Dark', { genres: ['Thriller', 'Crime', 'Horror', 'Mystery'], without: ['Comedy', 'Family', 'Animation'] }, PATHS.moon],
  ['mind', 'Mind-bending', { genres: ['Sci-Fi', 'Mystery', 'Thriller'], keywords: [{ id: 326438, name: 'twist ending' }, { id: 12565, name: 'psychological thriller' }] },
    'M12 12a1 1 0 1 1 1-1a3 3 0 1 1-3-3a5 5 0 1 1-5 5a7 7 0 1 1 7 7'],
  ['cosy', 'Cosy', { genres: ['Family', 'Animation', 'Comedy', 'Romance'], without: ['Horror', 'Thriller', 'War', 'Crime'] }, 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M9 3v3M12 3v3'],
  ['edge', 'Edge of your seat', { genres: ['Thriller', 'Action'], without: ['Comedy', 'Family', 'Animation'] }, 'M13 3L5 14h6l-1 7 8-11h-6z'],
  ['tears', 'Tear-jerker', { genres: ['Drama'], keywords: [{ id: 156924, name: 'tearjerker' }] }, 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z'],
  ['laugh', 'Laugh out loud', { genres: ['Comedy'], without: ['Drama', 'Horror', 'Documentary'] }, 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM7 13h10a5 5 0 0 1-10 0zM9 9h.01M15 9h.01'],
  ['epic', 'Epic', { genres: ['Adventure', 'Fantasy', 'History', 'War'], votes: 1000 }, 'M3 20l6-10 4 6 3-4 5 8z']];
// a mood off: what it filled cleared too
const unmood = (v: string): Partial<Filters> => ({ mood: undefined, ...Object.fromEntries(Object.keys(MOODS.find((x) => x[0] === v)?.[2] || {}).map((k) => [k, undefined])) });
// names of the networks older lists picked by id
const NETWORKS: [number, string][] = [[213, 'Netflix'], [49, 'HBO'], [3186, 'HBO Max'], [2552, 'Apple TV'], [1024, 'Prime Video'], [2739, 'Disney+'], [453, 'Hulu'],
  [4330, 'Paramount+'], [3353, 'Peacock'], [1112, 'Crunchyroll'], [174, 'AMC'], [88, 'FX'], [67, 'Showtime'], [318, 'STARZ'], [6, 'NBC'], [16, 'CBS'], [2, 'ABC'],
  [19, 'FOX'], [71, 'The CW'], [77, 'Syfy'], [34, 'Lifetime'], [56, 'Cartoon Network'], [13, 'Nickelodeon'], [54, 'Disney Channel'], [64, 'Discovery'],
  [4353, 'discovery+'], [43, 'National Geographic'], [4, 'BBC One'], [332, 'BBC Two'], [26, 'Channel 4'], [9, 'ITV1'], [614, 'TOKYO MX'], [1, 'Fuji TV'],
  [160, 'TBS (Japan)'], [98, 'TV Tokyo'], [156, 'SBS'], [97, 'MBC'], [866, 'tvN'], [3732, 'WeTV']];
const netsOf = (l: Filters['networks']): Picked[] => (l || []).map((x) => (typeof x === 'number' ? { id: x, name: label(NETWORKS, x) } : x));
// the sliders' steps: every tenth for a 0-10 score, every point for a percentage or Metacritic's 0-100 (the first, 0, is Any)
const steps = (to: number, by: number) => Array.from({ length: Math.round(to / by) + 1 }, (_, i) => Math.round(i * by * 10) / 10);
const TENTHS = steps(10, 0.1), POINTS = steps(100, 1);
// each source's floor steps, its unit, and which key the instance needs for it
const SOURCES: [Src, string, number[], string, 'omdb' | 'mal' | null][] = [
  ['imdb', 'IMDb', TENTHS, '', 'omdb'], ['rt', 'Rotten Tomatoes', POINTS, '%', 'omdb'], ['mc', 'Metacritic', POINTS, '', 'omdb'],
  ['mal', 'MyAnimeList', TENTHS, '', 'mal'], ['kitsu', 'Kitsu', POINTS, '%', null]];
// the Scores group's quick picks: the score and vote sliders (and other sources' floors) set at once, to adjust afterwards.
// The last two need their source's key and suit one kind each: critics (Rotten Tomatoes, Metacritic) rarely review anime,
// and MyAnimeList's fans rate only anime, so a list shows one of them, six picks either way
const PICKS: [string, string, Partial<Filters>, 'omdb' | 'mal' | null][] = [
  ['Hidden gems', 'M6 3h12l3 6-9 12L3 9zM3 9h18M9 3l3 6 3-6M12 9v12', { scoreFrom: 7.5, votes: 50, votesTo: 1000 }, null],
  ['So bad it’s good', 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM8 15c2-2 6-2 8 0M9 9h.01M15 9h.01', { scoreTo: 5, votes: 500 }, null],
  ['Crowd pleasers', PATHS.people, { scoreFrom: 7, votes: 10000 }, null],
  ['Masterpieces', 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 21h6M10 17h4', { scoreFrom: 8.3, votes: 2500 }, null],
  ['Cult classics', PATHS.moon, { scoreFrom: 7, scoreTo: 8.5, votes: 500, votesTo: 5000 }, null],
  ['Critics’ darlings', 'M5 7h5v5H7a3 3 0 0 0 3 3M14 7h5v5h-3a3 3 0 0 0 3 3', { ext: { rt: 90, mc: 80 } }, 'omdb'],
  ['Fan favourites', PATHS.heart, { votes: 100, ext: { mal: 8.5 } }, 'mal']];
const SCORED: (keyof Filters)[] = ['scoreFrom', 'scoreTo', 'votes', 'votesTo', 'ext', 'extTo', 'avg', 'avgTo', 'imdbVotes', 'imdbVotesTo', 'malVotes', 'malVotesTo'];
// the TMDB score slider in tenths (Any at both ends: no floor, no ceiling); votes on rounder steps
const SCORE_STEPS = TENTHS;
const tenth = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const VOTE_STEPS = [0, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const IMDB_VOTES = [...VOTE_STEPS, 250000, 500000, 1000000];
const votesText = (v: number) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1000 ? `${v / 1000}k` : String(v));
const votesRange = (a?: number, b?: number) => (a && b ? `${votesText(a)}–${votesText(b)}` : a ? `${votesText(a)}+` : `up to ${votesText(b!)}`);
const WATCHED: [NonNullable<Filters['watched']>, string][] = [['year', 'Watched this year'], ['old', 'Watched over a year ago'], ['started', 'Started, not finished']];
export const label = <T,>(opts: [T, string][], v: T) => opts.find((o) => o[0] === v)?.[1] || String(v);
const range = (a: number | undefined, b: number | undefined, unit = '') => (a && b ? `${a}–${b}${unit}` : a ? `${a}+${unit}` : `up to ${b}${unit}`);

export function Builder({ draft, page, close, saved }: { draft: Draft; page: { genres: Record<Media, string[]> }; close: () => void; saved: (id: string) => Promise<void> }) {
  const [d, setD] = useState(() => ({ ...draft, filters: tidy(draft.filters) })), [g, setG] = useState<Group>('basics'), [busy, setBusy] = useState(false), [e, setE] = useState('');
  const [prev, setPrev] = useState<{ total: number; count: number; pending: number; pool: number; posters: { key: string; title: string; poster: string | null; day: number | null }[] } | null>(null), [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null), [got, setGot] = useState<{ cc: string; r: RegionInfo } | null>(null);
  const [seeing, setSeeing] = useState(false), [full, setFull] = useState(false);
  const [keys, setKeys] = useState<{ mal: boolean; omdb: boolean; tvdb?: boolean } | null>(null), [opts, setOpts] = useState<{ languages: Country[]; countries: Country[] } | null>(null);
  useEffect(() => { let live = true; getJ<{ languages: Country[]; countries: Country[] }>('/api/lists/options').then((o) => { if (live) setOpts(o); }, () => {}); return () => { live = false; }; }, []);
  useEffect(() => { let live = true; getJ<{ sources: { mal: boolean; omdb: boolean; tvdb?: boolean } }>('/api/config').then((c) => { if (live) setKeys(c.sources); }, () => {}); return () => { live = false; }; }, []);
  const f = d.filters, setF = (x: Partial<Filters>) => setD((y) => ({ ...y, filters: { ...y.filters, ...x } }));
  const yours = prefs ? prefs.country || guessCountry() : null, region = f.region || yours;
  // your country and the countries; a new list (or one from before lists had countries) starts with yours
  useEffect(() => { let live = true; getJ<Prefs>('/api/region').then((p) => { if (!live) return; setPrefs(p); setD((y) => (y.filters.region ? y : { ...y, filters: { ...y.filters, region: p.country || guessCountry() } })); }, () => {}); return () => { live = false; }; }, []);
  useEffect(() => { if (!region) return; let live = true; getJ<RegionInfo>(`/api/region/${region}`).then((r) => { if (live) setGot({ cc: region, r }); }, () => {}); return () => { live = false; }; }, [region]);
  const reg = got?.cc === region ? got.r : null;
  const key = JSON.stringify([d.media, f]);
  useEffect(() => {
    if (!f.region) return;
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const got = {} as NonNullable<typeof prev>, err = await postJ('/api/lists/preview', { media: d.media, filters: f }, got as unknown as Record<string, unknown>);
      if (live) { setPrev(err ? null : got); setLoading(false); }
    }, 500);
    return () => { live = false; clearTimeout(t); };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const esc = (x: KeyboardEvent) => { if (x.key === 'Escape') close(); }; document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [close]);
  const save = async () => {
    const name = d.name.trim();
    if (!name) return setE('Give the list a name');
    setBusy(true);
    const got: { id?: string } = {}, body = { name, description: d.description, media: d.media, filters: f, shared: !!d.shared };
    const err = d.id ? await postJ(`/api/lists/${d.id}/edit`, body) : await postJ('/api/lists/new', { ...body, kind: 'smart' }, got);
    setBusy(false);
    if (err) return setE(say(err) || '');
    await saved(d.id || got.id!);
  };

  const films = d.media === 'movie' || d.media === 'animefilm' || d.media === 'both', shows = d.media === 'tv' || d.media === 'anime' || d.media === 'both', cname = (c?: string) => prefs?.countries.find((x) => x.id === c)?.name || c || '';
  const svcs = reg ? servicesOf(reg.services) : [], svcName = (id: number | string) => svcs.find((x) => x.ids.includes(id as number))?.name || String(id);
  // services: a name's ids, ids' names
  const ids = (v: number[]) => svcs.filter((x) => v.includes(x.ids[0])).flatMap((x) => x.ids), firsts = (v: number[]) => svcs.filter((x) => x.ids.some((id) => v.includes(id))).map((x) => x.ids[0]);
  const country = prefs && <Drop label="Watch country" search opts={prefs.countries.map((c) => [c.id, c.name])} value={region || ''}
    set={(c) => setF({ region: c, cert: undefined, certs: undefined, tvCerts: undefined, my: c === yours ? f.my : undefined, services: [], servicesOut: undefined })} />;
  const picked = (f.services || []).filter((x): x is number => typeof x === 'number');
  const mineHere = !!prefs && region === yours && prefs.services.length > 0;
  const when = f.when || (f.yearFrom || f.yearTo ? 'years' : 'any');
  const lim = (l: Partial<Record<Src, number>> | undefined, k: Src, v: number | undefined) => { const e = { ...l, [k]: v || undefined }; return Object.values(e).some(Boolean) ? e : undefined; };
  const setExt = (k: Src, [lo, hi]: [number | undefined, number | undefined]) => setF({ ext: lim(f.ext, k, lo), extTo: lim(f.extTo, k, hi) });
  // checked per title: other sources' scores, their average, vote counts, awards
  const floors = SOURCES.filter(([k]) => f.ext?.[k] || f.extTo?.[k]).length + (f.avg || f.avgTo ? 1 : 0), checked = floors + (f.imdbVotes || f.imdbVotesTo ? 1 : 0) + (f.malVotes || f.malVotesTo ? 1 : 0) + (f.awards?.length || f.awardsOut?.length ? 1 : 0);
  const lib = libraryOnly(f), home = !!(f.home?.length || f.airing?.length), groups = GROUPS.filter(([k]) => !lib || k !== 'streaming' || home);
  const at = groups.some(([k]) => k === g) ? g : 'basics';
  // how many go in (scores picking: how many have passed so far, of the candidates checked)
  const said = loading ? 'Looking…' : !prev ? 'No preview' : checked > 0 ? `${prev.count} of ${prev.pool} pass` : `${prev.count} ${prev.count === 1 ? 'title' : 'titles'}`;
  const langs = f.languages?.length ? f.languages : f.language ? [f.language] : [], lands = f.countries?.length ? f.countries : f.country ? [f.country] : [];
  // age ratings, mildest first
  const rated = (reg?.certs || []).filter((c) => c !== 'NR'), tvRated = (reg?.tvCerts || []).filter((c) => c !== 'NR');
  // cast and crew are films' (TMDB's show search ignores them); a mood fills genres and keywords
  const people = d.media === 'movie' || d.media === 'animefilm' || d.media === 'both';
  const mood = (v: string) => { const m = MOODS.find((x) => x[0] === v)!; setF(f.mood === v ? unmood(v) : { ...(f.mood ? unmood(f.mood) : {}), genres: [], without: [], keywords: [], match: 'any', ...m[2], mood: v }); };
  // what's set, as the strip's tags (each with what its × clears) and each group's count
  type Tag = [Group, string, (() => void) | null, boolean?];
  const T = (grp: Group, t: string, clear: (() => void) | null, no?: boolean): Tag => [grp, t, clear, no];
  const tags: Tag[] = [
    T('basics', KIND[d.media][0], null), T('basics', cname(region || undefined), null),
    ...describe(d.media, f, { svc: reg ? svcName : undefined, lang: (l) => opts?.languages.find((x) => x.id === l)?.name || langName(l),
      land: (c) => opts?.countries.find((x) => x.id === c)?.name || landName(c) }).slice(1).map(([g, t, patch, no]) => T(g, t, patch ? () => setF(patch) : null, no)),
    ...(d.shared ? [T('list', 'Shared', () => setD({ ...d, shared: false }))] : []),
  ];
  const count = (k: Group) => tags.filter((t) => t[0] === k && t[2]).length;
  const anime = d.media === 'anime' || d.media === 'animefilm';
  // a new kind starts its genres over (anime series and movies share theirs); New releases are movies' and anime movies' only
  const setKind = (m: Media) => setD({ ...d, media: m, filters: { ...f, ...(anime && (m === 'anime' || m === 'animefilm') ? {} : { genres: [], without: [] }), cert: undefined, certs: undefined, tvCerts: undefined,
    ext: only(f.ext, m), extTo: only(f.extTo, m), ...(m === 'animefilm' ? { home: some((f.home || []).filter((k) => k === 'digital' || k === 'streaming')) } : {}),
    ...(m !== 'anime' && m !== 'animefilm' && ['season', 'lastSeason', 'nextSeason'].includes(f.when || '') ? { when: undefined } : {}),
    ...(m !== 'anime' && m !== 'animefilm' ? { malVotes: undefined, malVotesTo: undefined } : {}),
    sort: f.sort === 'box' && m === 'tv' ? undefined : f.sort,
    ...(m !== 'movie' && m !== 'animefilm' ? { home: undefined, homeCinema: undefined } : {}), ...(m !== 'tv' && m !== 'anime' ? { airing: undefined } : {}),
    ...((m === 'movie' || m === 'animefilm' ? !f.home?.length : m === 'tv' || m === 'anime' ? !f.airing?.length : true) ? { homeWithin: undefined, ...(f.sort === 'release' || f.sort === 'releaseOld' ? { sort: undefined } : {}) } : {}) } });
  const setHome = (home: NonNullable<Filters['home']>) => setF(homePatch(f, home));
  // Movies' New releases: the latest digital, 4K and Blu-ray releases
  const latest = <>
    <div className="b-sec"><span className="dd-l">New releases</span><div className="pk-set">{HOME.filter(([ks]) => d.media !== 'animefilm' || ks.includes('digital')).map(([ks, n, face]) => {
      const on = ks.some((k) => f.home?.includes(k));
      return <PkBtn key={n} label={n} data={{}} face={face} on={on} pressed={on} onClick={() => setHome(on ? f.home!.filter((y) => !ks.includes(y)) : [...(f.home || []), ...ks])} />; })}</div></div>
    {!!f.home?.length && <div className="b-lines"><SwitchRow label="Only movies from cinemas" on={!!f.homeCinema} set={(on) => setF({ homeCinema: on || undefined })} /></div>}
    </>;
  // New on TV
  const latestShows = <>
    <div className="b-sec"><span className="dd-l">New on TV</span><div className="pk-set">{AIRING.map(([v, n, face]) => {
      const on = !!f.airing?.includes(v);
      return <PkBtn key={v} label={n} data={{}} face={face} on={on} pressed={on} onClick={() => setF(airingPatch(f, on ? f.airing!.filter((y) => y !== v) : [...(f.airing || []), v]))} />; })}</div></div>
    </>;

  const pane: Record<Group, ReactNode> = {
    basics: <>
      <div className="b-dds">{country}</div>
      {/* Anime is one circle; its Shows | Movies circles under it pick series or films */}
      <div className="b-sec"><span className="dd-l">Kind</span><div className="pk-set">{(['movie', 'tv', 'anime', 'both'] as Media[]).map((m) => {
        const on = m === 'anime' ? anime : d.media === m;
        return <PkBtn key={m} label={m === 'anime' ? 'Anime' : KIND[m][0]} data={{}} face={KIND[m][1]} on={on} pressed={on} onClick={() => { if (!on) setKind(m); }} />; })}</div></div>
      {anime && <div className="b-sec"><span className="dd-l">Anime</span><div className="pk-set">{([['anime', 'Shows', PATHS.tv], ['animefilm', 'Movies', PATHS.movie]] as const).map(([m, n, face]) =>
        <PkBtn key={m} label={n} data={{}} face={face} on={d.media === m} pressed={d.media === m} onClick={() => setKind(m)} />)}</div></div>}
      {(d.media === 'movie' || d.media === 'animefilm') && latest}
      {(d.media === 'tv' || d.media === 'anime') && latestShows}
      <div className="b-dds">
        {home ? <Drop label="Order" opts={HOME_ORDER} value={f.sort && HOME_ORDER.some(([v]) => v === f.sort) ? f.sort : 'release'} set={(sort) => setF({ sort: sort === 'release' ? undefined : sort })} />
          : <Drop label="Order" opts={[['popular', 'Popular'], ['rating', 'Rating'], ['newest', 'Newest'], ['oldest', 'Oldest'], ['az', 'A–Z'], ...(films && !lib ? [['box', 'Box office'] as ['box', string]] : []),
            ...(lib ? [] : [['votes', 'Most voted'] as ['votes', string]]), ['shuffle', 'Shuffle']]} value={f.sort || 'popular'} set={(sort) => setF({ sort })} />}
        <Drop label="How many" opts={[[20, '20'], [40, '40'], [60, '60'], [100, '100'], [200, '200'], [250, '250'], [500, '500']]} value={f.max || 60} set={(max) => setF({ max })} />
      </div>
    </>,
    genres: <>
      <div className="pk-set b-quick">{MOODS.map(([v, n, , face]) => <PkBtn key={v} label={n} data={{}} face={face} on={f.mood === v} pressed={f.mood === v} onClick={() => mood(v)} />)}</div>
      <InOut label="Genres" opts={page.genres[d.media].map((n): [string, string] => [n, n])} ins={f.genres || []} outs={f.without || []} set={(genres, without) => setF({ genres, without })} />
      <div className="b-dds">
        {d.media === 'tv' && keys?.tvdb && <Drop label="TV category (TheTVDB)" opts={[[0, 'None'], ...TVDB_CATS]} value={f.tvdbGenre || 0} set={(c) => setF({ tvdbGenre: c || undefined })} />}
        <Drop label="Match genres" opts={[['any', 'Any of them'], ['all', 'All of them']]} value={f.match || 'any'} set={(match) => setF({ match })} />
      </div>
      <InOutSearch kind="keyword" label="Keywords" value={f.keywords || []} set={(keywords) => setF({ keywords })} />
      {(f.keywords || []).filter((x) => !x.out).length > 1 && <div className="b-half"><Drop label="Match keywords" opts={[['any', 'Any of them'], ['all', 'All of them']]} value={f.kwMatch || 'any'} set={(kwMatch) => setF({ kwMatch: kwMatch === 'any' ? undefined : kwMatch })} /></div>}
    </>,
    release: <>
      <div className="b-dds">
      {home ? <Drop label="Release date" opts={WITHIN} value={f.homeWithin || 90} set={(x) => setF({ homeWithin: x === 90 ? undefined : x })} />
        : <Drop label="Release date" opts={anime ? ANIME_WHEN : WHEN} value={when} set={(w) => setF({ when: w === 'any' ? undefined : w, ...(w !== 'years' ? { yearFrom: undefined, yearTo: undefined } : {}) })} />}
      {!home && when === 'years' && <Drop label="From" search opts={[[0, 'Any'], ...YEARS]} value={f.yearFrom || 0} set={(y) => setF({ yearFrom: y || undefined })} />}
      {!home && when === 'years' && <Drop label="To" search opts={[[0, 'Any'], ...YEARS]} value={f.yearTo || 0} set={(y) => setF({ yearTo: y || undefined })} />}
      <Drop label="Decades" multi opts={DECADES} value={f.decades || []} set={(decades) => setF({ decades: decades.length ? decades : undefined })} />
      {!lib && <Drop label="Released" opts={[['both', 'Any'], ['out', 'Already out'], ['coming', 'Upcoming']]} value={f.released || 'both'} set={(released) => setF({ released })} />}
      {films && !lib && <Drop label="Released as" multi empty="Any" opts={OUT.filter(([v]) => v === 'cinema' || v === 'tv' || f.out?.includes(v))} value={f.out || []} set={(out) => setF({ out: out.length ? out : undefined })} />}
      {films && <Drop label={shows ? 'Movie status' : 'Status'} multi empty="Any" opts={MOVIE_STATUS} value={f.movieStatus || []} set={(v) => setF({ movieStatus: some(v) })} />}
      {shows && !lib && <Drop label={films ? 'Show status' : 'Status'} multi empty="Any" opts={STATUS} value={f.status || []} set={(status) => setF({ status: status.length ? status : undefined })} />}
      {shows && !lib && <Drop label="Type" multi opts={TV_TYPE} value={f.type || []} set={(type) => setF({ type: type.length ? type : undefined })} />}
      <Drop label="Runtime from" opts={MINUTES} value={f.runtimeFrom || 0} set={(m) => setF({ runtimeFrom: m || undefined })} />
      <Drop label="Runtime to" opts={MINUTES} value={f.runtimeTo || 0} set={(m) => setF({ runtimeTo: m || undefined })} />
      {films && <Drop label={shows ? 'Collection (movies)' : 'Collection'} opts={[['', 'Any'], ...COLLECTION]} value={f.collection || ''} set={(c) => setF({ collection: c || undefined })} />}
      <Drop label="Trailer" opts={[['', 'Any'], ['yes', 'Has a trailer']]} value={f.trailer ? 'yes' : ''} set={(t) => setF({ trailer: !!t || undefined })} />
    </div>
      {films && !lib && <div className="b-lines"><SwitchRow label={shows ? 'Released in my watch country (movies)' : 'Released in my watch country'} on={f.reach === 'released'}
        set={(on) => setF({ reach: on ? 'released' : undefined })} /></div>}
      {films && <InOutSearch kind="collection" label={shows ? 'Franchises (movies)' : 'Franchises'} value={f.collections || []} set={(collections) => setF({ collections })} />}
      {films && <div className="b-dds">
        <Drop label={shows ? 'Budget (movies)' : 'Budget'} opts={MONEY} value={f.budgetFrom || 0} set={(v) => setF({ budgetFrom: v || undefined })} />
        <Drop label={shows ? 'Box office (movies)' : 'Box office'} opts={MONEY} value={f.revenueFrom || 0} set={(v) => setF({ revenueFrom: v || undefined })} />
      </div>}
    </>,
    scores: <>
      <div className="pk-set b-quick">{PICKS.filter(([, , , need]) => !need || (keys?.[need] && (need === 'mal') === (d.media === 'anime' || d.media === 'animefilm'))).map(([n, icon, set]) => {
        const on = SCORED.every((k) => JSON.stringify(set[k] ?? null) === JSON.stringify(f[k] ?? null));
        return <PkBtn key={n} label={n} data={{}} face={icon} on={on} pressed={on}
          onClick={() => setF(Object.fromEntries(SCORED.map((k) => [k, on ? undefined : set[k]])) as Partial<Filters>)} />; })}
      </div>
      <div className="b-sliders">
        <Slider range label="TMDB score" steps={SCORE_STEPS} show={tenth} value={[f.scoreFrom, f.scoreTo]} set={([scoreFrom, scoreTo]) => setF({ scoreFrom, scoreTo })} />
        <Slider range label="TMDB votes" steps={VOTE_STEPS} show={votesText} value={[f.votes, f.votesTo]} set={([votes, votesTo]) => setF({ votes, votesTo })} />
        {keys && SOURCES.filter(([k, , , , need]) => (!need || keys[need]) && sourceFits(d.media, k)).map(([k, n, st, unit]) =>
          <Fragment key={k}><Slider range label={n} steps={st} show={(v) => `${unit ? v : tenth(v)}${unit}`} value={[f.ext?.[k], f.extTo?.[k]]} set={(v) => setExt(k, v)} />
            {k === 'imdb' && <Slider range label="IMDb votes" steps={IMDB_VOTES} show={votesText} value={[f.imdbVotes, f.imdbVotesTo]} set={([imdbVotes, imdbVotesTo]) => setF({ imdbVotes, imdbVotesTo })} />}
            {k === 'mal' && <Slider range label="MyAnimeList votes" steps={IMDB_VOTES} show={votesText} value={[f.malVotes, f.malVotesTo]} set={([malVotes, malVotesTo]) => setF({ malVotes, malVotesTo })} />}</Fragment>)}
        <Slider range label="Average of all scores (out of 100)" steps={POINTS} show={String} value={[f.avg, f.avgTo]} set={([avg, avgTo]) => setF({ avg, avgTo })} />
      </div>
      <InOut label="Awards" opts={AWARDS} ins={f.awards || []} outs={f.awardsOut || []} set={(a, o) => setF({ awards: some(a), awardsOut: some(o) })} />
      {floors > 0 && <div className="b-dds">
        <Drop label="Match scores" opts={[['all', 'All of them'], ['any', 'Any of them']]} value={f.meet || 'all'} set={(meet) => setF({ meet: meet === 'all' ? undefined : meet })} />
        <Drop label="Missing score" opts={[['out', 'Leave out'], ['keep', 'Keep']]} value={f.missing || 'out'} set={(missing) => setF({ missing: missing === 'out' ? undefined : missing })} />
      </div>}
    </>,
    streaming: <>
      <div className="b-sec"><span className="dd-l">Available as</span><div className="pk-set">{WAYS.map(([ws, n, face]) => {
        const on = ws.some((w) => f.watch?.includes(w));
        return <PkBtn key={n} label={n} data={{}} face={face} on={on} pressed={on} onClick={() => setF({ watch: some(on ? (f.watch || []).filter((x) => !ws.includes(x)) : [...(f.watch || []), ...ws]) })} />; })}</div></div>
      <div className="b-sec">
        <div className="b-h"><span className="dd-l">Services</span>
          {mineHere && <button type="button" className={`l-chip${f.my ? ' on' : ''}`} aria-pressed={!!f.my} onClick={() => setF({ my: !f.my || undefined })}>{`My services · ${prefs!.services.length}`}</button>}</div>
        {!reg ? <p className="acct-note">Loading the services…</p> : <div className="b-dds">
          {!f.my && <Drop label="Include" multi search empty="Any" opts={svcs.map((x): [number, string] => [x.ids[0], x.name])} value={firsts(picked)}
            set={(v) => setF({ services: ids(v), servicesOut: some((f.servicesOut || []).filter((x) => !ids(v).includes(x))) })} />}
          <Drop label="Exclude" multi search empty="None" opts={svcs.map((x): [number, string] => [x.ids[0], x.name])} value={firsts(f.servicesOut || [])}
            set={(v) => setF({ servicesOut: some(ids(v)), services: picked.filter((x) => !ids(v).includes(x)) })} />
        </div>}
      </div>
      {shows && <InOutSearch kind="network" label={d.media === 'both' ? 'TV networks (shows)' : 'TV networks'} value={netsOf(f.networks)} set={(networks) => setF({ networks })} />}
    </>,
    language: <>
      {d.media !== 'anime' && d.media !== 'animefilm' && opts && <InOut label="Original language" search opts={opts.languages.map((l): [string, string] => [l.id, l.name])} ins={langs} outs={f.languagesOut || []}
        set={(l, o) => setF({ language: undefined, languages: some(l), languagesOut: some(o) })} />}
      {opts && <InOut label="Made in" search opts={opts.countries.map((c): [string, string] => [c.id, c.name])} ins={lands} outs={f.countriesOut || []}
        set={(c, o) => setF({ country: undefined, countries: some(c), countriesOut: some(o) })} />}
    </>,
    people: <>
      {people && <InOutSearch kind="person" label={d.media === 'both' ? 'Cast (movies)' : 'Cast'} value={f.cast || []} set={(cast) => setF({ cast })} />}
      {people && (f.cast || []).filter((x) => !x.out).length > 1 && <div className="b-half"><Drop label="Match cast" opts={[['any', 'Any of them'], ['all', 'All of them']]} value={f.castMatch || 'any'} set={(castMatch) => setF({ castMatch: castMatch === 'any' ? undefined : castMatch })} /></div>}
      {people && <InOutSearch kind="person" label={d.media === 'both' ? 'Director, writer (movies)' : 'Director and writer'} value={f.crew || []} set={(crew) => setF({ crew })} />}
      <InOutSearch kind="company" label="Studios" value={f.companies || []} set={(companies) => setF({ companies })} />
    </>,
    list: <>
      <div className="b-dds">
        <Drop label="Refresh" opts={[['6h', 'Every 6 hours'], ['12h', 'Every 12 hours'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['never', 'Never']]} value={f.refresh || 'daily'} set={(refresh) => setF({ refresh })} />
        {films && (!lib || home) && !!rated.length && <Drop label={shows ? 'Movie age ratings' : 'Age ratings'} multi empty="Any" opts={rated.map((c): [string, string] => [c, c])}
          value={f.certs || []} set={(v) => setF({ certs: some(v), cert: undefined })} />}
        {shows && (!lib || home) && !!tvRated.length && <Drop label={films ? 'Show age ratings' : 'Age ratings'} multi empty="Any" opts={tvRated.map((c): [string, string] => [c, c])}
          value={f.tvCerts || []} set={(v) => setF({ tvCerts: some(v) })} />}
      </div>
      <div className="b-lines">
        <SwitchRow label="Hide what I’ve watched" on={!!f.hideWatched} set={(hideWatched) => setF({ hideWatched })} />
        <SwitchRow label="Hide what’s on Plan to watch" on={!!f.hidePlan} set={(hidePlan) => setF({ hidePlan })} />
        <SwitchRow label="Only what I’ve rated" on={!!f.onlyRated} set={(onlyRated) => setF({ onlyRated })} />
        <SwitchRow label="Show on Home" on={!!f.row} set={(row) => setF({ row: row || undefined })} />
        <SwitchRow label="Share with everyone on this Listick" on={!!d.shared} set={(shared) => setD({ ...d, shared })} />
      </div>
    </>,
  };
  return (
    <div className="look-scrim l-ov" onClick={(x) => { if (x.target === x.currentTarget) close(); }}>
      <div className="glass l-sheet" role="dialog" aria-modal="true" aria-labelledby="b-name">
        <div className="b-head">
          <div className="b-title"><label className="dd-l" htmlFor="b-name">{d.id ? 'Smart list' : 'New smart list'}</label>
            <input id="b-name" className="b-name" maxLength={60} value={d.name} placeholder="Name it" onChange={(x) => setD({ ...d, name: x.target.value })} />
            <input className="b-about" maxLength={200} value={d.description} placeholder="Add a line about it" aria-label="About" onChange={(x) => setD({ ...d, description: x.target.value })} /></div>
          <div className="pk-set"><PkBtn label="Cancel" data={{}} face={PATHS.cross} on={false} onClick={close} />
            <PkBtn label={busy ? 'Saving…' : d.id ? 'Save' : 'Make list'} data={{}} face={PATHS.tick} on onClick={() => { if (!busy) void save(); }} /></div>
        </div>
        <div className="b-tags">{tags.map(([grp, t, clear, no], i) => (
          <span key={i} className={`b-tag${no ? ' no' : ''}`}>{clear ? <button type="button" onClick={() => setG(grp)}>{t}</button> : t}
            {clear && <button type="button" className="b-x" aria-label={`Remove ${t}`} onClick={clear}><Icon d={PATHS.cross} size={12} width={2.2} /></button>}</span>))}</div>
        {e && <p className="acct-err b-err">{e}</p>}
        <div className={`b-body${full ? ' full' : ''}`}>
          <nav className="b-nav" aria-label="List options">{groups.map(([k, n, ic]) => (
            <button key={k} type="button" className={`b-tab${at === k ? ' on' : ''}`} aria-current={at === k} onClick={() => setG(k)}>
              <span className="pk-c"><Icon d={ic} size={18} width={1.9} /></span><span className="b-tn">{n}</span>{count(k) > 0 && <span className="b-n">{count(k)}</span>}</button>))}</nav>
          <div className="b-pane">{pane[at]}</div>
          {/* on a phone the preview is a bar at the foot, all of it the button that opens the posters over the settings: the first
              three stacked as on the list cards, the count, a chevron; the scores' progress a line along its top */}
          <aside className={`b-prev${seeing ? ' open' : ''}`}>
            <div className="b-ph"><span className={`dd-l${loading ? ' busy' : ''}`}>{said}</span>
              <button type="button" className="b-full" aria-pressed={full} onClick={() => setFull(!full)}>{full ? 'Back' : 'Preview'}</button></div>
            <button type="button" className="b-see" aria-expanded={seeing} aria-label={`${said}: ${seeing ? 'hide' : 'see'} the titles`} onClick={() => setSeeing(!seeing)}>
              <span className="l-stack">{prev?.posters.slice(0, 3).map((t) => t.poster && <img key={t.key} src={t.poster} alt="" />)}</span>
              <span className={`b-sn${loading ? ' busy' : ''}`}>{said}</span><Icon d="M6 15l6-6 6 6" size={20} width={1.9} />
            </button>
            {prev && checked > 0 && prev.pool > 0 && <div className="b-check"><span>titles checked</span><span>{`${prev.pool - prev.pending} / ${prev.pool}`}</span>
              <i style={{ width: `${prev.pool ? Math.round(((prev.pool - prev.pending) / prev.pool) * 100) : 0}%` }} /></div>}
            {/* New releases: each poster's day */}
            <div className="l-pgrid">{prev?.posters.map((t) => <figure key={t.key} className="b-pi"><img src={t.poster || undefined} alt={t.title} title={t.title} loading="lazy" />
              {t.day && <span className="b-pd">{new Date(t.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}</figure>)}</div>
          </aside>
        </div>
      </div>
    </div>
  );
}
