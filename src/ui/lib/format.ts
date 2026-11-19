// Dates, times and episode labels as the page shows them (en-GB, the device's time zone).
export const DASH = '—';
// a TMDB image's srcset by kind
const SETS = { poster: [['w342', 342], ['w500', 500], ['w780', 780]], still: [['w300', 300], ['w780', 780], ['original', 1920]],
  wide: [['w780', 780], ['w1280', 1280], ['original', 3840]] } as const;
export const srcs = (u: string | null | undefined, kind: keyof typeof SETS) => (u && /\/\/image\.tmdb\.org\/t\/p\/\w+\//.test(u)
  ? SETS[kind].map(([s, w]) => `${u.replace(/\/t\/p\/\w+\//, `/t/p/${s}/`)} ${w}w`).join(', ') : undefined);
// poster card width
export const CARD_SIZES = '(min-width: 1181px) 14vw, (min-width: 801px) 16vw, 50vw';
export const titles = (n: number) => `${n} title${n === 1 ? '' : 's'}`;
export const hhmm = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const shortDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export function ago(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`;
}
export function dayWord(t: number) {
  const d = new Date(t), now = new Date();
  const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400000);
  if (diff === 0) return 'today'; if (diff === 1) return 'tomorrow'; if (diff === -1) return 'yesterday';
  if (diff > 0 && diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return shortDate(t);
}
export const epLabel = (p: { season?: number | null; ep?: number | null; epTo?: number | null }) =>
  [p.season != null ? `S${p.season}` : null, p.ep != null ? `E${p.ep}${p.epTo ? `–${p.epTo}` : ''}` : null].filter(Boolean).join(' ');
// an error message as a sentence ("wrong password" -> "Wrong password.")
export const say = (m: string | null | undefined) => (m ? `${m[0].toUpperCase()}${m.slice(1)}.` : null);
