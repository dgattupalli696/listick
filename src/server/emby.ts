// Emby webhooks as Jellyfin events (jellyfin.ts)
import type { Hook } from './jellyfin';

type Payload = { Event?: string; Item?: { Type?: string; Name?: string; SeriesName?: string; ProductionYear?: number; ParentIndexNumber?: number; IndexNumber?: number;
  IndexNumberEnd?: number; RunTimeTicks?: number; ProviderIds?: Record<string, string> }; PlaybackInfo?: { PositionTicks?: number; PlayedToCompletion?: boolean } };
const EVENTS: Record<string, string> = { 'playback.start': 'PlaybackStart', 'playback.unpause': 'PlaybackStart', 'playback.pause': 'PlaybackStop',
  'playback.stop': 'PlaybackStop', 'playback.scrobble': 'UserDataSaved', 'item.markplayed': 'UserDataSaved' };
const str = (v: unknown) => (v == null ? '' : String(v));

export function embyHook(body: string | null): Hook | null {
  let p: Payload;
  try { p = JSON.parse(body || ''); } catch { return null; }
  const m = p.Item, event = EVENTS[p.Event || ''];
  if (!m || !event) return null;
  const ids = Object.fromEntries(Object.entries(m.ProviderIds || {}).map(([k, v]) => [k.toLowerCase(), str(v)]));
  return { event, type: m.Type, name: m.Name, series: m.SeriesName, year: str(m.ProductionYear), season: str(m.ParentIndexNumber), episode: str(m.IndexNumber),
    episodeEnd: str(m.IndexNumberEnd), tmdb: ids.tmdb, imdb: ids.imdb, tvdb: ids.tvdb, done: p.Event === 'playback.stop' && p.PlaybackInfo?.PlayedToCompletion ? 'True' : 'False',
    played: 'True', position: str(p.PlaybackInfo?.PositionTicks), runtime: str(m.RunTimeTicks) };
}
