import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { sendContactMessage } from '../lib/api'

export const MAX_WORDS = 200
export const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/** "Contact us" pop-up: a one-way note to the admins, max 200 words. */
export function ContactSheet({ open, onClose, defaultName = '', defaultContact = '' }: { open: boolean; onClose: () => void; defaultName?: string; defaultContact?: string }) {
  const [name, setName] = useState(defaultName)
  const [contact, setContact] = useState(defaultContact)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  // Signed-in users: fill in who they are, but let them change it.
  useEffect(() => {
    if (!open) return
    setName((n) => n || defaultName)
    setContact((c) => c || defaultContact)
  }, [open, defaultName, defaultContact])

  const words = countWords(message)
  const over = words > MAX_WORDS
  const canSend = name.trim().length > 0 && message.trim().length >= 5 && !over && !busy

  const close = () => {
    onClose()
    if (sent) { setName(defaultName); setContact(defaultContact); setMessage(''); setSent(false) }
    setErr(null)
  }

  const send = async () => {
    if (!canSend) return
    setBusy(true); setErr(null)
    try {
      await sendContactMessage({ name: name.trim(), contact: contact.trim() || null, message: message.trim() })
      setSent(true)
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={close}>
      {sent ? (
        <>
          <div className="h2">Message sent</div>
          <div className="meta" style={{ lineHeight: 1.5 }}>Thanks. The Christ NCR Forum team reads every message. This box is one-way, so you won't get a reply here.</div>
          <button className="btn btn-primary" onClick={close}>Done</button>
        </>
      ) : (
        <>
          <div className="h2">Contact us</div>
          <div className="meta" style={{ lineHeight: 1.45 }}>{defaultName ? 'Want to talk to the Christ NCR Forum team one-on-one? Write to us directly' : 'Having trouble signing in or using the board? Tell us'} in up to {MAX_WORDS} words.</div>

          <label className="label" htmlFor="contact-name">Your name <span style={{ color: 'var(--pink)' }}>*</span></label>
          <input id="contact-name" className="input" value={name} maxLength={80} autoComplete="name" placeholder="First name and surname"
            onChange={(e) => setName(e.target.value)} />

          <label className="label" htmlFor="contact-reach">Email or phone <span style={{ color: 'var(--meta)', fontWeight: 500 }}>(optional)</span></label>
          <input id="contact-reach" className="input" value={contact} maxLength={120} autoComplete="email" placeholder="So we know who wrote in"
            onChange={(e) => setContact(e.target.value)} />

          <label className="label" htmlFor="contact-msg">Your message <span style={{ color: 'var(--pink)' }}>*</span></label>
          <textarea id="contact-msg" className="input" value={message} rows={6} style={{ height: 'auto', minHeight: 140, padding: 12, resize: 'vertical', lineHeight: 1.45 }}
            placeholder="What's the problem?" onChange={(e) => setMessage(e.target.value)} />
          <div className="tnum" style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', color: over ? 'var(--pink)' : 'var(--meta)' }}>
            {words} / {MAX_WORDS} words{over ? ' · please shorten it' : ''}
          </div>

          {err && <div style={{ background: 'var(--pink)', color: '#0A0A0A', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={close}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 2 }} disabled={!canSend} onClick={send}>{busy ? 'Sending…' : 'Send message'}</button>
          </div>
        </>
      )}
    </Sheet>
  )
}
