import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const DISMISS_KEY = 'christncr.install.dismissed'
let deferred: BIPEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent; listeners.forEach((l) => l()) })
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()) })
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Everything a screen needs to offer "Add to home screen". */
export function useInstall() {
  const [, bump] = useState(0)
  useEffect(() => { const l = () => bump((n) => n + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  const [howOpen, setHowOpen] = useState(false)
  const install = async () => {
    if (deferred) {
      const ev = deferred
      await ev.prompt()
      const { outcome } = await ev.userChoice
      if (outcome === 'accepted') deferred = null
      listeners.forEach((l) => l())
      return
    }
    setHowOpen(true)
  }
  return { installed: isStandalone(), canPrompt: !!deferred, install, howOpen, closeHow: () => setHowOpen(false) }
}

/** Manual steps for browsers without an install prompt (Safari on iPhone, mostly). */
export function InstallHowSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ios = isIOS()
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="h2">Add Christ NCR Forum to your home screen</div>
      {ios ? (
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, lineHeight: 1.45 }}>
          <li>Open this page in <b>Safari</b> (it has to be Safari on iPhone).</li>
          <li>Tap the <b>Share</b> button: the square with an arrow at the bottom of the screen.</li>
          <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        </ol>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, lineHeight: 1.45 }}>
          <li>Open the browser menu: the <b>⋮</b> or <b>⋯</b> button.</li>
          <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
          <li>Confirm. The board opens full-screen from its own icon after that.</li>
        </ol>
      )}
      <button className="btn btn-primary" onClick={onClose}>Got it</button>
    </Sheet>
  )
}

/** Small card at the top of the feed, until installed or dismissed. */
export function InstallBanner() {
  const { installed, install, howOpen, closeHow } = useInstall()
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return true } })
  if (installed || hidden) return null
  const dismiss = () => { setHidden(true); try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ } }
  return (
    <>
      <div className="install-banner">
        <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 12, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Put Christ NCR Forum on your home screen</div>
          <div className="meta" style={{ fontSize: 13 }}>Opens like an app, no browser bar.</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn sm" style={{ height: 36 }} onClick={dismiss}>Not now</button>
          <button className="btn btn-primary sm" style={{ height: 36 }} onClick={install}>Install</button>
        </div>
      </div>
      <InstallHowSheet open={howOpen} onClose={closeHow} />
    </>
  )
}
