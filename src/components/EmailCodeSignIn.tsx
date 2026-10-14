import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

const ALLOWED_EMAIL = /^[a-z0-9._%+-]+@([a-z0-9-]+\.)*christuniversity\.in$/i

/** Sign in with a one-time code sent to a @christuniversity.in inbox. */
export function EmailCodeSignIn({ onError }: { onError: (msg: string | null) => void }) {
  const { sendEmailCode, verifyEmailCode } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])
  useEffect(() => { if (stage === 'code') codeRef.current?.focus() }, [stage])

  const send = async () => {
    const e = email.trim().toLowerCase()
    if (!ALLOWED_EMAIL.test(e)) { onError('Use your @christuniversity.in email address.'); return }
    onError(null); setBusy(true)
    try {
      await sendEmailCode(e)
      setStage('code'); setCode(''); setCooldown(60)
    } catch (err) {
      const m = (err as Error).message
      onError(/rate limit|too many/i.test(m) ? 'Too many codes requested. Wait a minute and try again.' : m)
    } finally { setBusy(false) }
  }

  const verify = async () => {
    const t = code.replace(/\D/g, '')
    if (t.length < 6) { onError('Enter the 6-digit code from the email.'); return }
    onError(null); setBusy(true)
    try {
      await verifyEmailCode(email.trim().toLowerCase(), t)
      // Session change redirects away from /login.
    } catch (err) {
      const m = (err as Error).message
      onError(/expired|invalid/i.test(m) ? 'That code is wrong or has expired. Request a new one.' : m)
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className="btn" style={{ height: 52, borderRadius: 16, background: 'transparent', color: '#fff', borderColor: '#333' }} onClick={() => setOpen(true)}>
        Sign in with email code instead
      </button>
    )
  }

  const field: React.CSSProperties = { height: 52, borderRadius: 14, border: '2px solid #333', background: '#161616', color: '#fff', padding: '0 14px', fontSize: 17, width: '100%', fontFamily: 'inherit' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#111', border: '2px solid #222', borderRadius: 18, padding: 14 }}>
      {stage === 'email' ? (
        <>
          <label style={{ fontSize: 13, color: '#BDBDBD', fontWeight: 600 }}>Your Christ NCR email</label>
          <input
            type="email" inputMode="email" autoComplete="email" placeholder="name.surname@bbafth.christuniversity.in"
            value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            style={field} aria-label="Christ NCR email address"
          />
          <button className="btn btn-primary" style={{ height: 52 }} disabled={busy || !email} onClick={send}>
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
          <div style={{ fontSize: 12, color: '#9A9A9A', textAlign: 'center' }}>We send a 6-digit code. No password, nothing to remember.</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 14, color: '#BDBDBD' }}>Code sent to <b style={{ color: '#fff' }}>{email.trim().toLowerCase()}</b>. Check spam if it takes more than a minute.</div>
          <input
            ref={codeRef} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} placeholder="6-digit code"
            value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') verify() }}
            style={{ ...field, letterSpacing: '.3em', textAlign: 'center', fontSize: 22, fontWeight: 700 }} aria-label="One-time code"
          />
          <button className="btn btn-primary" style={{ height: 52 }} disabled={busy || code.replace(/\D/g, '').length < 6} onClick={verify}>
            {busy ? 'Checking…' : 'Verify and sign in'}
          </button>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
            <button className="btn sm" style={{ height: 36, background: 'transparent', color: '#BDBDBD', borderColor: '#333' }} onClick={() => { setStage('email'); onError(null) }}>Change email</button>
            <button className="btn sm" style={{ height: 36, background: 'transparent', color: '#BDBDBD', borderColor: '#333' }} disabled={busy || cooldown > 0} onClick={send}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
