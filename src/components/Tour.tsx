import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../hooks/useAuth'

const SEEN_KEY = 'christncr.tour.v1'
const REPLAY_KEY = 'christncr.tour.replay'

type Step = { target: string; title: string; text: string; admin?: boolean; optional?: boolean }

const STEPS: Step[] = [
  { target: 'brand', title: 'Welcome to Christ NCR Forum', text: 'This is the complaint board for Christ NCR. Post a problem, upvote the ones you share, and watch the clock run until it is fixed. Your posts are anonymous to other students.' },
  { target: 'tabs', title: 'Categories', text: 'Filter the board by topic. "Attention" collects anything with more than 50 upvotes. Safety posts are private and never appear here.' },
  { target: 'sort', title: 'Sorting', text: 'Top shows the most upvoted, New the latest, and Oldest unresolved the problems that have waited longest.' },
  { target: 'card', title: 'A complaint', text: 'The timer counts up from the moment it was posted and stops when an admin marks it resolved. Tap the title to open it and see the status timeline and official replies.', optional: true },
  { target: 'vote', title: 'Upvote', text: 'One upvote per person; tap again to take it back. More upvotes move a problem up the board and, past 50, into Attention.', optional: true },
  { target: 'flag', title: 'Flag', text: 'Spotted spam, abuse or a named person? Flag it with a reason. Three flags hide a post until an admin reviews it.', optional: true },
  { target: 'fab', title: 'New complaint', text: 'Pick a category, describe the problem, choose how many working days to give them, and post. An AI pass cleans up the title and points you to similar posts you could upvote instead.' },
  { target: 'mine', title: 'Mine', text: 'Everything you have posted: status, timer, edit while it has no upvotes, delete any time, and reopen within 7 days of a resolution. After the days you gave are up, we ask you here whether it was solved.' },
  { target: 'admin', title: 'Admin', text: 'You are an admin: real names, status changes, official replies, the flag queue, private reports and the user directory live here.', admin: true },
  { target: 'settings', title: 'Settings', text: 'Your profile (name, course, class, year, nationality), the theme, and sign out.' },
  { target: 'theme', title: 'Light or dark', text: 'Switch any time. That is the tour; the board is yours.' },
]

const q = (name: string) => document.querySelector<HTMLElement>(`[data-tour="${name}"]`)

export function startTour() {
  try { sessionStorage.setItem(REPLAY_KEY, '1') } catch { /* ignore */ }
  window.dispatchEvent(new Event('christncr-tour'))
}

/** First-visit walkthrough. Mount on the Feed screen. */
export function Tour() {
  const { isAdmin } = useAuth()
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [tick, setTick] = useState(0)

  const steps = STEPS.filter((s) => !s.admin || isAdmin).filter((s) => !s.optional || q(s.target))
  const step = steps[i]

  // Start once per device, or on request.
  useEffect(() => {
    const shouldStart = () => {
      try {
        if (sessionStorage.getItem(REPLAY_KEY) === '1') { sessionStorage.removeItem(REPLAY_KEY); return true }
        return !localStorage.getItem(SEEN_KEY)
      } catch { return false }
    }
    const begin = () => { setI(0); setActive(true) }
    const t = window.setTimeout(() => { if (shouldStart()) begin() }, 900) // let the feed render first
    const onReq = () => begin()
    window.addEventListener('christncr-tour', onReq)
    return () => { clearTimeout(t); window.removeEventListener('christncr-tour', onReq) }
  }, [])

  const finish = useCallback(() => {
    setActive(false)
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
  }, [])

  // Measure the current target; re-measure on scroll/resize.
  useLayoutEffect(() => {
    if (!active || !step) return
    const el = q(step.target)
    if (!el) { setRect(null); return }
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    const measure = () => setRect(el.getBoundingClientRect())
    const t = window.setTimeout(measure, 350)
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [active, step, tick])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); if (e.key === 'ArrowRight' || e.key === 'Enter') next() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!active || !step) return null

  const next = () => { if (i + 1 >= steps.length) finish(); else { setI(i + 1); setTick((t) => t + 1) } }
  const back = () => { if (i > 0) { setI(i - 1); setTick((t) => t + 1) } }

  const pad = 8
  const r = rect
  const vw = window.innerWidth, vh = window.innerHeight
  const tipW = Math.min(340, vw - 32)
  // Place the card below the target when there is room, else above; centre horizontally near it.
  let top = r ? r.bottom + pad + 12 : vh / 2 - 100
  let placeAbove = false
  if (r && top + 220 > vh) { placeAbove = true; top = Math.max(16, r.top - pad - 12 - 220) }
  const left = r ? Math.min(Math.max(16, r.left + r.width / 2 - tipW / 2), vw - tipW - 16) : (vw - tipW) / 2

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label={step.title}>
      {r ? (
        <div className="tour-spot" style={{ left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={{ top, left, width: tipW }} data-above={placeAbove ? '1' : '0'}>
        <div className="tour-step">{i + 1} / {steps.length}</div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-text">{step.text}</div>
        <div className="row" style={{ gap: 8, marginTop: 4 }}>
          <button className="btn" style={{ height: 38, fontSize: 13 }} onClick={finish}>Skip</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {i > 0 && <button className="btn" style={{ height: 38, fontSize: 13 }} onClick={back}>Back</button>}
            <button className="btn btn-primary sm" style={{ height: 38 }} onClick={next}>{i + 1 >= steps.length ? 'Done' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
