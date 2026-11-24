// Awards for smart lists: wins and nominations (a nomination includes a win) at the Oscars, Primetime Emmys, Golden Globes,
// BAFTA, Cannes, any award, Razzies and Best Picture, from Wikidata (meta 'awards', weekly) and OMDb; bits per title in title_scores (source 'awards')
import { q } from './db';
import { metaGet, metaSet } from './store';
import { getJSON } from './sources';
import { HOUR } from './util';

// new ones last
export const AWARDS = ['oscar', 'emmy', 'globe', 'bafta', 'cannes', 'any', 'razzie', 'picture'] as const;
type Award = (typeof AWARDS)[number];
// an award's bit
export const bitOf = (a: string) => { const [k, l] = a.split('-'), i = AWARDS.indexOf(k as Award); return i < 0 || (l !== 'won' && l !== 'nom') ? 0 : 1 << (i * 2 + (l === 'won' ? 0 : 1)); };
const both = (k: Award) => bitOf(`${k}-won`) | bitOf(`${k}-nom`);

// each award's categories on Wikidata
const FAMILY: [Exclude<Award, 'any' | 'cannes' | 'picture'>, string][] = [['oscar', 'wd:Q19020'], ['emmy', 'wd:Q1044427'], ['globe', 'wd:Q1011547'], ['bafta', 'wd:Q732997'], ['bafta', 'wd:Q1369077'],
  ['razzie', 'wd:Q40237']];
type Kept = Record<string, string[]>;   // '<award>-won' | '<award>-nom' -> IMDb ids
const sparql = async (where: string) => (await getJSON<{ results: { bindings: { imdb: { value: string } }[] } }>(
  `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(`SELECT DISTINCT ?imdb WHERE { ${where} ?s wdt:P345 ?imdb. FILTER(STRSTARTS(?imdb, "tt")) }`)}`,
  { accept: 'application/sparql-results+json' }, 180000)).results.bindings.map((b) => b.imdb.value);

// the worker: winners and nominees, weekly
export async function refreshAwards() {
  const kept = await metaGet<{ at: number; v: Kept }>('awards');
  // an award added: fetched now, titles' bits checked again
  const added = !!kept && !kept.v[`${AWARDS.at(-1)}-nom`];
  if (kept && !added && Date.now() - kept.at < 7 * 24 * HOUR) return;
  const v: Kept = {};
  const add = (k: string, ids: string[]) => { v[k] = [...new Set([...v[k] || [], ...ids])]; };
  for (const [k, fam] of FAMILY) for (const [rel, l] of [['P166', 'won'], ['P1411', 'nom']] as const)
    add(`${k}-${l}`, await sparql(`?a wdt:P31|wdt:P361 ${fam}. ?s wdt:${rel} ?a.`));
  add('cannes-won', await sparql('?s wdt:P166 wd:Q179808.'));
  add('cannes-nom', await sparql('?s wdt:P1411 wd:Q179808.'));
  add('picture-won', await sparql('?s wdt:P166 wd:Q102427.'));
  add('picture-nom', await sparql('?s wdt:P1411 wd:Q102427.'));
  await metaSet('awards', { at: Date.now(), v });
  if (added) await q.run("delete from title_scores where source = 'awards'");
  console.log(`awards: ${Object.entries(v).map(([k, ids]) => `${k} ${ids.length}`).join(', ')}`);
}

let sets: { at: number; v: Map<string, number> } | null = null;
// an IMDb id's bits from Wikidata
async function wikidata(imdb: string) {
  if (!sets || Date.now() - sets.at > HOUR) {
    const v = new Map<string, number>(), kept = (await metaGet<{ v: Kept }>('awards'))?.v || {};
    for (const [k, ids] of Object.entries(kept)) for (const id of ids) v.set(id, (v.get(id) || 0) | bitOf(k) | bitOf(k.replace('-won', '-nom')));
    sets = { at: Date.now(), v };
  }
  return sets.v.get(imdb) || 0;
}
// OMDb's awards line
export function fromOmdb(text: string | null | undefined) {
  if (!text) return 0;
  let b = 0;
  for (const [k, name] of [['oscar', 'Oscar'], ['emmy', 'Primetime Emmy'], ['globe', 'Golden Globe'], ['bafta', 'BAFTA']] as const) {
    if (new RegExp(`Won \\d+ ${name}`).test(text)) b |= both(k);
    else if (new RegExp(`Nominated for \\d+ ${name}`).test(text)) b |= bitOf(`${k}-nom`);
  }
  const wins = Number(text.match(/(\d+) wins?\b/)?.[1] || 0), noms = Number(text.match(/(\d+) nominations?\b/)?.[1] || 0);
  if (wins) b |= both('any'); else if (noms) b |= bitOf('any-nom');
  return b;
}
// a title's bits
export async function awardBits(imdb: string | null | undefined, omdbText: string | null | undefined) {
  let b = (imdb ? await wikidata(imdb) : 0) | fromOmdb(omdbText);
  // Razzies: not part of any award
  for (const k of AWARDS.filter((a) => a !== 'any' && a !== 'razzie')) {
    if (b & bitOf(`${k}-won`)) b |= both('any');
    else if (b & bitOf(`${k}-nom`)) b |= bitOf('any-nom');
  }
  return b;
}
// any asked for, none left out
export const awardsPass = (b: number, ins: string[] = [], outs: string[] = []) =>
  (!ins.length || ins.some((a) => b & bitOf(a))) && !outs.some((a) => b & bitOf(a));
