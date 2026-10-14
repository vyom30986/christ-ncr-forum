import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { aiReview, createComplaint, fetchPublicByIds, toggleVote } from '../lib/api'
import { CATEGORIES, STATUS, categoryLabel } from '../lib/labels'
import type { AiReview, Category, PublicComplaint } from '../lib/types'
import { Sheet } from '../components/Sheet'
import { ClockIcon, CloseIcon, LockIcon, SparkIcon, ThumbIcon } from '../components/Icons'
import { TetrisDots } from '../components/TetrisLoader'

const MAX = 1000
const GRACE_OPTIONS = [1, 2, 3, 5, 7, 10, 14]

export default function Compose() {
  const nav = useNavigate()
  const { session } = useAuth()
  const toast = useToast()
  const [cat, setCat] = useState<Category>('housing')
  const [body, setBody] = useState('')
  const [priv, setPriv] = useState(false)
  const [grace, setGrace] = useState(3) // working days before we check back
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<AiReview | null>(null)
  const [title, setTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [similar, setSimilar] = useState<PublicComplaint[]>([])
  const [posting, setPosting] = useState(false)
  const [slow, setSlow] = useState(false) // AI taking a while: offer to skip it
  const reviewRun = useRef(0)

  const isSafety = cat === 'safety'
  const isPrivate = priv || isSafety
  // The AI may reclassify a post as Safety, which is always private.
  const effectivePrivate = isPrivate || review?.category === 'safety'
  useEffect(() => { if (isSafety) setPriv(true) }, [isSafety])


  const runReview = async () => {
    if (body.trim().length < 10) { toast('Say a little more: at least 10 characters.', 'err'); return }
    const run = ++reviewRun.current
    setBusy(true)
    setSlow(false)
    const slowTimer = window.setTimeout(() => setSlow(true), 4000)
    try {
      const r = await aiReview({ body: body.trim(), category: cat })
      if (run !== reviewRun.current) return // the student skipped the AI meanwhile
      setReview(r)
      setTitle(r.clean_title)
      setEditingTitle(false)
      setSimilar(await fetchPublicByIds(r.similar_ids))
    } catch (e) {
      // The AI is a helper, not a gate: on any error, fall back to the student's own title.
      if (run === reviewRun.current) { toast((e as Error).message, 'err'); skipAi() }
    } finally {
      clearTimeout(slowTimer)
      if (run === reviewRun.current) { setBusy(false); setSlow(false) }
    }
  }

  /** Post with your own words when the AI is slow or down. */
  const skipAi = () => {
    reviewRun.current++
    const collapsed = body.replace(/\s+/g, ' ').trim()
    const first = collapsed.split(/[.!?]/)[0]!.trim()
    const raw = first.length >= 3 ? first : collapsed
    const cut = (raw.length <= 80 ? raw : raw.slice(0, 80).replace(/\s+\S*$/, '')).trim()
    const t = cut.charAt(0).toUpperCase() + cut.slice(1)
    setReview({ category: cat, clean_title: t, contains_person_name: false, abusive: false, similar_ids: [], degraded: true })
    setTitle(t)
    setEditingTitle(false)
    setSimilar([])
    setBusy(false)
    setSlow(false)
  }

  const post = async () => {
    if (!review) return
    setPosting(true)
    try {
      const id = await createComplaint({
        author_id: session!.user.id,
        category: review.category,
        title: title.trim().slice(0, 80) || review.clean_title,
        body: body.trim(),
        is_private: isPrivate || review.category === 'safety',
        grace_days: grace,
      })
      toast(isPrivate ? 'Sent privately to admins.' : 'Posted. The clock is running.')
      nav(isPrivate ? '/mine' : `/c/${id}`, { replace: true })
    } catch (e) {
      toast((e as Error).message, 'err')
      setPosting(false)
    }
  }

  const voteSimilar = async (c: PublicComplaint) => {
    setSimilar((prev) => prev.map((x) => (x.id === c.id ? { ...x, has_voted: !x.has_voted, upvotes: x.upvotes + (x.has_voted ? -1 : 1) } : x)))
    try { await toggleVote(c.id, session!.user.id, c.has_voted) } catch (e) { toast((e as Error).message, 'err') }
  }

  const blocked = review?.abusive
  const needsRewrite = review?.contains_person_name && !review.abusive

  return (
    <div className="screen">
      <div className="row" style={{ padding: '16px 16px 16px' }}>
        <button className="btn btn-icon" aria-label="Close" onClick={() => (window.history.state?.idx > 0 ? nav(-1) : nav('/'))}><CloseIcon /></button>
        <div className="h2">New complaint</div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="label">Category</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map((k) => (
            <button key={k.key} className={`chip sm ${cat === k.key ? 'on' : ''}`} onClick={() => setCat(k.key)}>
              {k.label}{k.private ? ' 🔒' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ margin: '18px 16px 0', flex: 1, minHeight: 220 }}>
        <textarea
          className="textarea"
          placeholder="What's going wrong? Be specific: where, since when, who you've told."
          value={body}
          maxLength={MAX}
          onChange={(e) => setBody(e.target.value)}
          autoFocus
        />
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, color: 'var(--meta)' }}>
          <span>Posting anonymously · no name, no course</span>
          <span className="tnum">{body.length} / {MAX}</span>
        </div>
      </div>

      <button
        onClick={() => !isSafety && setPriv((p) => !p)}
        aria-pressed={isPrivate}
        aria-label="Private: only admins can see this complaint"
        style={{
          margin: '12px 16px 0', minHeight: 64, padding: '12px 14px', borderRadius: 18, background: 'transparent', color: 'var(--fg)',
          border: `1.5px solid ${isPrivate ? 'var(--purple)' : 'var(--line)'}`, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        }}
      >
        <LockIcon />
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Private</span>
          <span style={{ fontSize: 13, color: 'var(--meta)' }}>{isSafety ? 'Safety is always private' : 'Safety/Harassment — admins only'}</span>
        </span>
        <span className={`toggle-track ${isPrivate ? 'on' : ''}`}><span className="toggle-knob" /></span>
      </button>

      <div style={{ margin: '12px 16px 0', border: '1.5px solid var(--line)', borderRadius: 18, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ gap: 12 }}>
          <ClockIcon />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Give them {grace} working day{grace === 1 ? '' : 's'}</span>
            <span style={{ fontSize: 13, color: 'var(--meta)' }}>Then we ask you if it's solved. If not, and nothing's promised, it escalates.</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {GRACE_OPTIONS.map((d) => (
            <button key={d} className={`chip sm ${grace === d ? 'on' : ''}`} style={{ minWidth: 44, padding: '0 10px' }} onClick={() => setGrace(d)}>{d}d</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 16px calc(36px + var(--safe-bottom))' }}>
        <button className="btn btn-primary" style={{ width: '100%', height: 60, fontSize: 18 }} disabled={busy || body.trim().length < 10} onClick={runReview}>
          {busy ? <><TetrisDots /> Reading it over…</> : 'Post'}
        </button>
        {!busy && body.trim().length > 0 && body.trim().length < 10 && (
          <div className="meta" style={{ fontSize: 13, textAlign: 'center', marginTop: 8 }}>Write at least 10 characters to post.</div>
        )}
        {busy && slow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <div className="meta" style={{ fontSize: 13, textAlign: 'center' }}>The AI is taking a while. You can post with your own title instead.</div>
            <button className="btn sm" style={{ height: 40 }} onClick={skipAi}>Post without AI</button>
          </div>
        )}
      </div>

      <Sheet open={Boolean(review)} onClose={() => !posting && setReview(null)}>
        <div className="row" style={{ fontSize: 13, fontWeight: 700, color: 'var(--christncr)' }}><SparkIcon />{review?.degraded ? 'Preview (AI is busy right now)' : 'AI preview'}</div>
        {review?.degraded && <div className="meta" style={{ fontSize: 13 }}>Couldn't reach the AI this time, so the title is taken from your first sentence. Edit it if you like and post.</div>}

        {blocked ? (
          <div style={{ border: '2px solid var(--pink)', borderRadius: 22, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>This can't be posted</div>
            <div className="meta" style={{ lineHeight: 1.45 }}>It reads as abuse rather than a complaint. Rewrite it around what went wrong and what should change.</div>
          </div>
        ) : (
          <div style={{ border: '2px solid var(--fg)', borderRadius: 22, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row" style={{ gap: 6 }}>
              <span className="pill-cat">{categoryLabel(review?.category ?? cat)}</span>
              <span className="pill-cohort on-bg">Anonymous</span>
              {effectivePrivate && <span className="pill-tag" style={{ background: 'var(--purple)', color: '#fff' }}>Private</span>}
              <button style={{ marginLeft: 'auto', border: 'none', background: 'none', fontSize: 12, fontWeight: 600, color: 'var(--meta)' }} onClick={() => setEditingTitle((v) => !v)}>
                {editingTitle ? 'Done' : 'Edit title'}
              </button>
            </div>
            {editingTitle ? (
              <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} autoFocus />
            ) : (
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2 }}>{title}</div>
            )}
            <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--meta)', whiteSpace: 'pre-wrap' }}>{body.trim()}</div>
            <div style={{ fontSize: 12, color: 'var(--meta)', fontWeight: 600 }}>Check-in after {grace} working day{grace === 1 ? '' : 's'}</div>
          </div>
        )}

        {needsRewrite && (
          <div style={{ background: 'var(--pink)', color: '#0A0A0A', borderRadius: 14, padding: '12px 14px', fontSize: 14, lineHeight: 1.4 }}>
            <b>Looks like this names a person.</b> Posts stay anonymous for everyone, so describe the role or office instead of the name, then post again.
          </div>
        )}

        {similar.length > 0 && !blocked && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Similar complaints exist — upvote instead?</div>
            {similar.map((s) => (
              <div key={s.id} className="row" style={{ gap: 12, background: 'var(--card)', borderRadius: 18, padding: '10px 10px 10px 14px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{s.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--meta)' }}>{categoryLabel(s.category)} · {s.upvotes} upvotes · {STATUS[s.status].label}</span>
                </div>
                <button className={`btn tnum ${s.has_voted ? 'btn-on' : ''}`} style={{ flexShrink: 0 }} onClick={() => voteSimilar(s)}>
                  <ThumbIcon size={16} />{s.upvotes}
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} disabled={posting} onClick={() => setReview(null)}>Edit</button>
          {!blocked && !needsRewrite && (
            <button className="btn btn-primary" style={{ flex: 2 }} disabled={posting || title.trim().length < 3} onClick={post}>
              {posting ? <><TetrisDots /> Posting…</> : similar.length > 0 ? 'Post anyway' : effectivePrivate ? 'Send privately' : 'Post'}
            </button>
          )}
        </div>
      </Sheet>
    </div>
  )
}
