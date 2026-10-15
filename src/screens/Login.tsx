import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Blocks, LOGIN_STACK } from '../components/Blocks'
import { DEMO } from '../lib/demo'
import { ContactSheet } from '../components/ContactSheet'

function oauthErrorFromUrl(): string | null {
  const q = new URLSearchParams(window.location.search)
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const desc = q.get('error_description') ?? h.get('error_description')
  if (!desc) return null
  // The enforce_christncr_domain trigger surfaces as a generic "Database error saving new user".
  if (/database error|christuniversity\.in/i.test(desc)) return 'Only @christuniversity.in Google accounts can sign in.'
  // Google refused Supabase's client credentials (e.g. a wrong client secret): not the student's fault.
  if (/exchange external code/i.test(desc)) return 'Google sign-in is not working right now. Please try again later or use ✉ Contact us.'
  return desc
}

/** WhatsApp, Instagram, Facebook, Telegram and friends open links in an embedded WebView. */
function inAppBrowser() {
  const ua = navigator.userAgent
  return /\bwv\b|WhatsApp|FBAN|FBAV|Instagram|Line\/|Telegram|LinkedInApp|Snapchat|TikTok|MicroMessenger/i.test(ua)
}
const isAndroid = () => /Android/i.test(navigator.userAgent)

/** Hand the page to the real browser. Android: Chrome intent. iOS: can only hint. */
function openInBrowser() {
  if (isAndroid()) {
    const u = new URL(location.href)
    location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href)};end`
  } else {
    window.open(location.href, '_blank')
  }
}

export default function Login() {
  const trapped = inAppBrowser()
  const { session, loading, signIn } = useAuth()
  const loc = useLocation()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [contactOpen, setContactOpen] = useState(false)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('christncr.auth.error')
      if (stored) { setErr(stored); sessionStorage.removeItem('christncr.auth.error') }
    } catch { /* ignore */ }
    const e = oauthErrorFromUrl()
    if (e) {
      setErr(e)
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  if (!loading && session) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/'} replace />

  return (
    <div className="login-bg">
    <div className="screen" style={{ background: '#0A0A0A', color: '#fff', maxWidth: 520 }}>
      <div style={{ padding: '40px 24px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="brand" style={{ fontSize: 84, letterSpacing: '-0.06em', lineHeight: 0.86 }}>
          CU<br /><span style={{ color: '#93c5fd' }}>FORUM</span>
        </div>
        <ul className="login-points">
          <li>The complaint board for Christ NCR</li>
          <li>Only for Christ NCR students</li>
          <li>Post it, upvote it, watch the clock</li>
        </ul>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '24px 24px 28px' }}>
        <Blocks rows={LOGIN_STACK} size={30} dim="rgba(255,255,255,.04)" />
      </div>
      <div style={{ padding: '0 16px calc(40px + var(--safe-bottom))', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {trapped && (
          <div style={{ background: 'var(--yellow)', color: '#0A0A0A', borderRadius: 14, padding: '12px 14px', fontSize: 14, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>Google sign-in does not work inside this app's browser. Open the board in Chrome{isAndroid() ? '' : ' or Safari'} instead.</span>
            <button className="btn sm" style={{ height: 38, background: '#0A0A0A', color: 'var(--yellow)', border: 'none', alignSelf: 'flex-start' }} onClick={openInBrowser}>
              {isAndroid() ? 'Open in Chrome' : 'Open in browser'}
            </button>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Or tap the ⋮ menu at the top and choose "Open in browser".</span>
          </div>
        )}
        {err && (
          <div style={{ background: 'var(--pink)', color: '#0A0A0A', borderRadius: 14, padding: '12px 14px', fontSize: 14, fontWeight: 600 }}>
            {err}
          </div>
        )}
        <button
          className="btn"
          style={{ height: 60, borderRadius: 18, border: 'none', background: 'var(--yellow)', color: '#0A0A0A', fontSize: 17, gap: 12 }}
          disabled={busy}
          onClick={async () => {
            setErr(null); setBusy(true)
            try { await signIn() } catch (e) { setErr((e as Error).message); setBusy(false) }
          }}
        >
          <span style={{ width: 28, height: 28, borderRadius: 8, background: '#0A0A0A', color: 'var(--yellow)', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700 }}>G</span>
          {busy ? 'Opening Google…' : DEMO ? 'Enter demo (no sign-in)' : 'Sign in with Christ NCR Google'}
        </button>
        <div style={{ fontSize: 13, lineHeight: 1.45, color: '#9A9A9A', textAlign: 'center', padding: '0 12px', textWrap: 'pretty' }}>
          Only @christuniversity.in accounts. Your posts are anonymous to other students.
        </div>
        <Link to="/" className="btn contact-btn">Browse the board without signing in</Link>
        <button className="btn contact-btn" onClick={() => setContactOpen(true)}>✉ Contact us</button>
      </div>
    </div>
    <ContactSheet open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  )
}
