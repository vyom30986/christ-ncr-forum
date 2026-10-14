export const DAY = 864e5
export const HOUR = 36e5
export const MIN = 6e4

const pad = (n: number) => String(n).padStart(2, '0')

export function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  }
}

/** "3d 4h 12m 08s" (or without seconds) */
export function dur(ms: number, secs = true) {
  const p = parts(ms)
  const head = p.d > 0 ? `${p.d}d ${p.h}h ${pad(p.m)}m` : p.h > 0 ? `${p.h}h ${pad(p.m)}m` : `${p.m}m`
  return secs ? `${head} ${pad(p.s)}s` : head
}

/** Live label for a complaint: ticks while open, freezes at resolved_at. */
export function timerLabel(
  c: { status: string; created_at: string; resolved_at: string | null; reopened_at?: string | null },
  now: number,
  secs = true,
) {
  const start = new Date(c.reopened_at ?? c.created_at).getTime()
  if (c.status === 'resolved' && c.resolved_at) {
    return `Resolved in ${dur(new Date(c.resolved_at).getTime() - start, false)}`
  }
  if (c.status === 'rejected') return 'Closed'
  return `Open ${dur(now - start, secs)}`
}

export function clockParts(c: { status: string; created_at: string; resolved_at: string | null; reopened_at?: string | null }, now: number) {
  const start = new Date(c.reopened_at ?? c.created_at).getTime()
  const end = c.status === 'resolved' && c.resolved_at ? new Date(c.resolved_at).getTime() : now
  const p = parts(end - start)
  return { d: String(p.d), h: pad(p.h), m: pad(p.m), s: pad(p.s) }
}

export function shortWhen(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit', minute: '2-digit',
  })
}

/** Days remaining in the 7-day reopen window, or null when closed. */
export function reopenDaysLeft(resolved_at: string | null, now: number) {
  if (!resolved_at) return null
  const left = new Date(resolved_at).getTime() + 7 * DAY - now
  return left > 0 ? Math.ceil(left / DAY) : null
}
