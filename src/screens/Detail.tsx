import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNow } from '../hooks/useNow'
import { useToast } from '../hooks/useToast'
import { useFeedRealtime } from '../hooks/useFeedRealtime'
import { fetchPublicComplaint, fetchUpdates, flagComplaint, toggleVote, unflagComplaint } from '../lib/api'
import { STATUS, STATUS_ORDER } from '../lib/labels'
import type { PublicComplaint, PublicUpdate, Status } from '../lib/types'
import { clockParts, shortWhen } from '../lib/time'
import { CatPill, CohortPill, StatusPill } from '../components/Pills'
import { BackIcon, FlagIcon, ShieldIcon, ThumbIcon } from '../components/Icons'
import { FlagSheet } from '../components/FlagSheet'
import { TetrisLoader } from '../components/TetrisLoader'
import { SignInSheet } from '../components/SignInNeeded'
import { Comments } from '../components/Comments'

export default function Detail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { session } = useAuth()
  const toast = useToast()
  const now = useNow()
  const [c, setC] = useState<PublicComplaint | null | undefined>(undefined)
  const [updates, setUpdates] = useState<PublicUpdate[]>([])
  const [flagOpen, setFlagOpen] = useState(false)
  const userId = session?.user.id ?? ''
  const guest = !session
  const [needSignIn, setNeedSignIn] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [row, ups] = await Promise.all([fetchPublicComplaint(id), fetchUpdates(id)])
      setC(row)
      setUpdates(ups)
    } catch (e) { toast((e as Error).message, 'err') }
  }, [id, toast])

  useEffect(() => { load() }, [load])
  useFeedRealtime((ids) => { if (ids.length === 0 || ids.includes(id)) load() })

  if (c === undefined) {
    return <div className="screen" style={{ justifyContent: 'center' }}><TetrisLoader label="Opening the complaint…" /></div>
  }
  if (c === null) {
    return (
      <div className="screen" style={{ padding: 16, gap: 16 }}>
        <button className="btn btn-icon" aria-label="Back" onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav('/'))}><BackIcon /></button>
        <div className="h2">This complaint isn't on the board</div>
        <div className="meta">It may have been deleted, hidden after flags, or sent privately. If it's yours, find it under <Link to="/mine" style={{ textDecoration: 'underline' }}>Mine</Link>.</div>
      </div>
    )
  }

  const clock = clockParts(c, now)
  const resolved = c.status === 'resolved'
  const rejected = c.status === 'rejected'
  const curIdx = STATUS_ORDER.indexOf(c.status as Status)
  const whenFor = (s: Status) => {
    if (s === 'open') return shortWhen(c.reopened_at ?? c.created_at)
    if (s === 'acknowledged') return shortWhen(c.acknowledged_at)
    if (s === 'resolved') return shortWhen(c.resolved_at)
    const u = [...updates].reverse().find((x) => x.status === s)
    return u ? shortWhen(u.created_at) : '—'
  }
  const replies = updates.filter((u) => u.note)

  const onVote = async () => {
    if (guest) { setNeedSignIn('upvote'); return }
    setC({ ...c, has_voted: !c.has_voted, upvotes: c.upvotes + (c.has_voted ? -1 : 1) })
    try { await toggleVote(c.id, userId, c.has_voted) } catch (e) { toast((e as Error).message, 'err'); load() }
  }
  const onFlag = async () => {
    if (guest) { setNeedSignIn('flag a post'); return }
    if (c.has_flagged) {
      setC({ ...c, has_flagged: false })
      try { await unflagComplaint(c.id, userId) } catch (e) { toast((e as Error).message, 'err'); load() }
    } else setFlagOpen(true)
  }

  return (
    <div className="screen">
      <div className="screen-scroll" style={{ paddingTop: 16, gap: 16 }}>
        <div className="row">
          <button className="btn btn-icon" aria-label="Back" onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav('/'))}><BackIcon /></button>
          <CatPill k={c.category} />
          <CohortPill course={c.course} year={c.grad_year} onCard />
          <StatusPill s={c.status} style={{ marginLeft: 'auto' }} />
        </div>

        <div className="h1" style={{ textWrap: 'pretty' }}>{c.title}</div>

        <div style={{ background: rejected ? 'var(--card)' : resolved ? 'var(--green)' : 'var(--yellow)', color: rejected ? 'var(--fg)' : '#0A0A0A', borderRadius: 22, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            {resolved ? 'Resolved in' : rejected ? 'Closed' : 'Open for'}
          </div>
          {!rejected && (
            <div className="tnum" style={{ display: 'flex', alignItems: 'baseline', gap: 4, letterSpacing: '-0.04em' }}>
              {(['d', 'h', 'm', 's'] as const).map((u) => (
                <span key={u} style={{ display: 'contents' }}>
                  <span style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{clock[u]}</span>
                  <span style={{ fontSize: 16, fontWeight: 600, marginRight: u === 's' ? 0 : 8 }}>{u}</span>
                </span>
              ))}
            </div>
          )}
          {rejected && <div style={{ fontSize: 15, fontWeight: 600 }}>An admin closed this without action. See the note below.</div>}
          <div style={{ position: 'absolute', right: 12, top: 12, display: 'grid', gridTemplateColumns: 'repeat(2,12px)', gridAutoRows: 12, gap: 2 }} aria-hidden>
            {[1, 0, 1, 1, 0, 1].map((on, i) => <div key={i} style={{ background: on ? 'rgba(10,10,10,.85)' : 'transparent', borderRadius: 2 }} />)}
          </div>
        </div>

        <div style={{ fontSize: 16, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.body}</div>

        <div>
          <div className="label" style={{ marginBottom: 10 }}>Status</div>
          {(rejected ? (['open', 'rejected'] as Status[]) : STATUS_ORDER).map((k, i, arr) => {
            const cur = rejected ? i === arr.length - 1 : i === curIdx
            const done = rejected ? i < arr.length - 1 : i < curIdx
            const reached = cur || done
            return (
              <div key={k} className="tl-row">
                <div className="tl-col">
                  <div className="tl-dot" style={{ background: done ? 'var(--fg)' : cur ? STATUS[k].bg : 'transparent', borderColor: cur ? STATUS[k].bg : done ? 'var(--fg)' : 'var(--line)' }} />
                  <div className="tl-line" style={{ background: i === arr.length - 1 ? 'transparent' : done ? 'var(--fg)' : 'var(--line)' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1, paddingBottom: 14, fontSize: 15 }}>
                  <span style={{ fontWeight: cur ? 700 : 500, color: reached ? 'var(--fg)' : 'var(--meta)' }}>{STATUS[k].label}</span>
                  <span className="tnum" style={{ color: 'var(--meta)', fontSize: 13 }}>{reached ? whenFor(k) : '—'}</span>
                </div>
              </div>
            )
          })}
        </div>

        {replies.map((u) => (
          <div key={u.id} style={{ border: '2px solid var(--christncr)', background: 'var(--mint)', borderRadius: 22, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--christncr)', color: 'var(--on-christncr)', display: 'grid', placeItems: 'center' }}><ShieldIcon size={18} /></span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Official reply · {STATUS[u.status].label}</span>
                <span style={{ fontSize: 12, color: 'var(--meta)' }}>{shortWhen(u.created_at)}</span>
              </span>
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{u.note}</div>
          </div>
        ))}

        <Comments complaintId={c.id} onNeedSignIn={setNeedSignIn} />
      </div>

      <div className="actionbar">
        <button className={`btn tnum ${c.has_voted ? 'btn-on' : ''}`} style={{ flex: 1, height: 56, borderRadius: 18, fontSize: 17, borderWidth: 2 }} onClick={onVote} aria-pressed={c.has_voted}>
          <ThumbIcon size={20} />{c.has_voted ? 'Upvoted' : 'Upvote'} · {c.upvotes}
        </button>
        <button className={`btn btn-icon ${c.has_flagged ? 'btn-flag-on' : ''}`} style={{ width: 56, height: 56, borderRadius: 18, color: c.has_flagged ? undefined : 'var(--meta)' }} onClick={onFlag} aria-label={c.has_flagged ? 'Remove flag' : 'Flag'} aria-pressed={c.has_flagged}>
          <FlagIcon size={20} />
        </button>
      </div>

      <SignInSheet open={needSignIn !== null} onClose={() => setNeedSignIn(null)} action={needSignIn ?? ''} />
      <FlagSheet open={flagOpen} onClose={() => setFlagOpen(false)} onSubmit={async (reason) => {
        setC({ ...c, has_flagged: true })
        try { await flagComplaint(c.id, userId, reason); toast('Flagged. Admins will take a look.') }
        catch (e) { toast((e as Error).message, 'err'); load() }
      }} />
    </div>
  )
}
