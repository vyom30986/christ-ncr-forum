import { useState } from 'react'
import { Sheet } from './Sheet'

const REASONS = ['Names a specific person', 'Abusive or hateful', 'Spam or advertising', 'Not a real complaint', 'Other']
const COMMENT_REASONS = ['Names a specific person', 'Abusive or hateful', 'Spam or advertising', 'Off-topic', 'Other']

export function FlagSheet({ open, onClose, onSubmit, what = 'post' }: {
  open: boolean; onClose: () => void; onSubmit: (reason: string) => Promise<void>; what?: 'post' | 'comment'
}) {
  const [reason, setReason] = useState(REASONS[0]!)
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const final = reason === 'Other' ? other.trim() : reason
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="h2">{what === 'comment' ? 'Report this comment' : 'Flag this post'}</div>
      <div className="meta">{what === 'comment'
        ? 'Comments with 3 or more reports are hidden until an admin reviews them. One report per person.'
        : 'Posts with 3 or more flags are hidden until an admin reviews them. One flag per person.'}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(what === 'comment' ? COMMENT_REASONS : REASONS).map((r) => (
          <button key={r} className={`chip sm ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>{r}</button>
        ))}
      </div>
      {reason === 'Other' && (
        <input className="input" placeholder="Tell admins what's wrong" value={other} maxLength={300}
          onChange={(e) => setOther(e.target.value)} />
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 2 }} disabled={busy || final.length < 2}
          onClick={async () => { setBusy(true); try { await onSubmit(final); onClose() } finally { setBusy(false) } }}>
          {what === 'comment' ? 'Report' : 'Flag'}
        </button>
      </div>
    </Sheet>
  )
}
