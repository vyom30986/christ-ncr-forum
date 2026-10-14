import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { answerCheckin, fetchDueCheckins } from '../lib/api'
import type { OwnComplaint } from '../lib/types'
import { categoryLabel } from '../lib/labels'
import { Sheet } from './Sheet'

// "Ask me later" hides the question for a few hours on this device.
const SNOOZE_MS = 4 * 60 * 60 * 1000
const key = (id: string) => `christncr.checkin.snooze.${id}`
const isSnoozed = (id: string) => { try { return Number(localStorage.getItem(key(id)) ?? 0) > Date.now() } catch { return false } }
const snooze = (id: string) => { try { localStorage.setItem(key(id), String(Date.now() + SNOOZE_MS)) } catch { /* private mode */ } }

/**
 * The follow-up pop-up. Shown to the author once a complaint's check-in is
 * due (3 business days after posting, or after a promised fix window).
 *   Solved?  Yes -> closed as resolved.
 *            No  -> "Has anyone promised a fix in the next 1-7 days?"
 *                   Yes, N days -> we ask again after N days.
 *                   No          -> escalated to admins + people in charge.
 */
export function CheckinPrompt() {
  const { session } = useAuth()
  const toast = useToast()
  const [queue, setQueue] = useState<OwnComplaint[]>([])
  const [step, setStep] = useState<'solved' | 'promise' | 'days'>('solved')
  const [days, setDays] = useState(3)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    try {
      const due = await fetchDueCheckins(session.user.id)
      setQueue(due.filter((c) => !isSnoozed(c.id)))
    } catch { /* quiet: it's a nudge, not a blocker */ }
  }, [session])

  useEffect(() => {
    load()
    const onVis = () => !document.hidden && load()
    document.addEventListener('visibilitychange', onVis)
    const id = window.setInterval(load, 10 * 60 * 1000)
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(id) }
  }, [load])

  const c = queue[0]
  if (!c) return null

  const answer = async (solved: boolean, promised?: number) => {
    setBusy(true)
    try {
      await answerCheckin(c.id, solved, promised)
      toast(solved ? 'Great. Marked as resolved.' : promised ? `Okay. We'll check back in ${promised} day${promised === 1 ? '' : 's'}.` : 'Escalated. Admins and the people in charge have been emailed.')
      setQueue((q) => q.slice(1)); setStep('solved')
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const later = () => { snooze(c.id); setQueue((q) => q.slice(1)); setStep('solved') }

  return (
    <Sheet open onClose={later}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--christncr)' }}>Quick check-in</div>
      <div className="card" style={{ gap: 6 }}>
        <div style={{ fontSize: 12, color: 'var(--meta)' }}>{categoryLabel(c.category)} · posted {new Date(c.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{c.title}</div>
      </div>

      {step === 'solved' && (
        <>
          <div className="h2">Has this been solved?</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setStep('promise')}>No</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => answer(true)}>Yes, solved</button>
          </div>
        </>
      )}

      {step === 'promise' && (
        <>
          <div className="h2">Has anyone promised to solve it in the next 1 to 7 days?</div>
          <div className="meta">If not, we'll escalate it to the admins and the people in charge right now.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1, borderColor: 'var(--pink)', color: 'var(--pink)' }} disabled={busy} onClick={() => answer(false)}>No, escalate</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => setStep('days')}>Yes</button>
          </div>
        </>
      )}

      {step === 'days' && (
        <>
          <div className="h2">Within how many days?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button key={d} className={`chip sm ${days === d ? 'on' : ''}`} style={{ minWidth: 40, flex: '0 0 auto' }} onClick={() => setDays(d)}>{d}</button>
            ))}
          </div>
          <div className="meta">We'll ask you again after {days} day{days === 1 ? '' : 's'}.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setStep('promise')}>Back</button>
            <button className="btn btn-primary" style={{ flex: 2 }} disabled={busy} onClick={() => answer(false, days)}>Remind me in {days}d</button>
          </div>
        </>
      )}

      <button style={{ border: 'none', background: 'none', color: 'var(--meta)', fontSize: 13, fontWeight: 600, alignSelf: 'center' }} onClick={later}>Ask me later</button>
    </Sheet>
  )
}
