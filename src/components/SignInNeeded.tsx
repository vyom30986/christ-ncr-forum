import { useLocation, useNavigate } from 'react-router-dom'
import { Sheet } from './Sheet'

/** Shown when a guest tries to post, upvote or flag. */
export function SignInSheet({ open, onClose, action }: { open: boolean; onClose: () => void; action: string }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="h2">Sign in to {action}</div>
      <div className="meta" style={{ fontSize: 15, lineHeight: 1.5 }}>
        Anyone can read the board. To post, upvote or flag, sign in with your <b>Christ NCR ID</b>: your college Google account, or a one-time code sent to your college email.
      </div>
      <button className="btn btn-primary" onClick={() => { onClose(); nav('/login', { state: { from: pathname } }) }}>Sign in with Christ NCR ID</button>
      <button className="btn" onClick={onClose}>Keep browsing</button>
    </Sheet>
  )
}

/** Thin strip at the top of guest screens. */
export function GuestStrip() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  return (
    <div className="guest-strip">
      <span><b>You are browsing as a guest.</b> Sign in with your Christ NCR ID to post, upvote or flag.</span>
      <button className="btn btn-primary sm" style={{ height: 34, flexShrink: 0 }} onClick={() => nav('/login', { state: { from: pathname } })}>Sign in</button>
    </div>
  )
}
