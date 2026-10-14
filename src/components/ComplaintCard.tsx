import { Link } from 'react-router-dom'
import type { PublicComplaint } from '../lib/types'
import { timerLabel } from '../lib/time'
import { CatPill, CohortPill, StatusPill, Timer } from './Pills'
import { CommentIcon, FlagIcon, ThumbIcon } from './Icons'

export function timerColor(c: { status: string; upvotes?: number; attention?: boolean }) {
  if (c.status === 'resolved') return 'var(--resolved-ink)'
  if (c.status === 'rejected') return 'var(--meta)'
  if (c.attention) return 'var(--pink)'
  return 'var(--fg)'
}

export function ComplaintCard({ c, now, onVote, onFlag, tour }: {
  c: PublicComplaint; now: number; onVote: (c: PublicComplaint) => void; onFlag: (c: PublicComplaint) => void; tour?: boolean
}) {
  return (
    <div className="card" data-tour={tour ? 'card' : undefined}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <CatPill k={c.category} />
        <CohortPill course={c.course} year={c.grad_year} />
        {c.attention && <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A' }}>Attention</span>}
        {c.is_mine && <span className="pill-tag" style={{ background: 'var(--bg)', color: 'var(--christncr)' }}>Yours</span>}
        <StatusPill s={c.status} style={{ marginLeft: 'auto' }} />
      </div>
      <Link to={`/c/${c.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="card-title">{c.title}</div>
        <div className="clamp2" style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--meta)' }}>{c.body}</div>
        {(c.comments ?? 0) > 0 && (
          <span className="comment-count"><CommentIcon size={14} />{c.comments} comment{c.comments === 1 ? '' : 's'}</span>
        )}
      </Link>
      <div className="row" style={{ marginTop: 2 }}>
        <Timer text={timerLabel(c, now)} color={timerColor(c)} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className={`btn tnum ${c.has_voted ? 'btn-on' : ''}`} style={{ minWidth: 72, fontSize: 15 }}
            onClick={() => onVote(c)} aria-pressed={c.has_voted} aria-label={c.has_voted ? 'Remove upvote' : 'Upvote'} data-tour={tour ? 'vote' : undefined}>
            <ThumbIcon />{c.upvotes}
          </button>
          <button className={`btn btn-icon ${c.has_flagged ? 'btn-flag-on' : ''}`} style={{ color: c.has_flagged ? undefined : 'var(--meta)' }}
            onClick={() => onFlag(c)} aria-label={c.has_flagged ? 'Remove flag' : 'Flag'} aria-pressed={c.has_flagged} data-tour={tour ? 'flag' : undefined}>
            <FlagIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
