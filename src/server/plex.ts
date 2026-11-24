// Plex webhooks as Jellyfin events (jellyfin.ts)
import type { Hook } from './jellyfin';

type Payload = { event?: string; user?: boolean; Metadata?: { type?: string; title?: string; grandparentTitle?: string; year?: number; parentIndex?: number;
  index?: number; viewOffset?: number; duration?: number; guid?: string; Guid?: ({ id?: string } | string)[] } };
const EVENTS: Record<string, string> = { 'media.play': 'PlaybackStart', 'media.resume': 'PlaybackStart', 'media.pause': 'PlaybackStop', 'media.stop': 'PlaybackStop',
  'media.scrobble': 'UserDataSaved' };
const TYPES: Record<string, string> = { movie: 'Movie', episode: 'Episode' };
const str = (v: unknown) => (v == null ? '' : String(v));

export function plexHook(body: string | null): Hook | null {
  let p: Payload;
  try { p = JSON.parse(body || ''); } catch { return null; }
  const m = p.Metadata, event = EVENTS[p.event || ''];
  if (!m || !event || p.user === false) return null;
  const ids = Object.fromEntries((m.Guid || []).map((g) => str(typeof g === 'string' ? g : g.id).split('://')).filter((x) => x.length === 2));
  // old agents: com.plexapp.agents.imdb://tt0133093?lang=en
  const old = (m.guid || '').match(/^com\.plexapp\.agents\.(imdb|themoviedb):\/\/(tt\d+|\d+)/);
  if (old) ids[old[1] === 'imdb' ? 'imdb' : 'tmdb'] ??= old[2];
  // ms to ticks
  const ticks = (ms?: number) => (ms == null ? '' : String(ms * 10000));
  return { event, type: TYPES[m.type || ''] || m.type, name: m.title, series: m.grandparentTitle, year: str(m.year), season: str(m.parentIndex), episode: str(m.index),
    tmdb: ids.tmdb, imdb: ids.imdb, tvdb: ids.tvdb, done: 'False', played: 'True', position: ticks(m.viewOffset), runtime: ticks(m.duration) };
}
