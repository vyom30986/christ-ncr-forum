import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Screenshot deterrence. A website cannot stop the operating system from
 * taking a screenshot, so this does what the browser allows:
 *  - the content blurs whenever the app loses focus (app switcher
 *    previews, Snipping Tool / Win+Shift+S, screen-capture overlays);
 *  - the Print Screen key blanks the screen briefly and clears the clipboard;
 *  - printing / "Save as PDF" prints a blank page (see @media print);
 *  - text selection, copy, right-click and long-press save are disabled
 *    outside form fields.
 */
export function ScreenGuard() {
  const [shield, setShield] = useState(false)

  useEffect(() => {
    let flashTimer = 0
    const hide = () => setShield(true)
    // Never trust hasFocus() alone: coming back to the app must always unhide it.
    const show = () => { if (document.visibilityState === 'visible') setShield(false) }
    const onVis = () => (document.visibilityState === 'hidden' ? hide() : show())
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      const macShot = (e.metaKey && e.shiftKey && ['3', '4', '5', '6'].includes(k))
      const winSnip = (e.metaKey && e.shiftKey && (k === 's' || k === 'S'))
      if (k === 'PrintScreen' || macShot || winSnip) {
        setShield(true)
        try { navigator.clipboard?.writeText('') } catch { /* not allowed: ignore */ }
        clearTimeout(flashTimer)
        flashTimer = window.setTimeout(() => setShield(false), 1500)
      }
    }
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.closest('input, textarea, [contenteditable="true"]') !== null)
    const blockCopy = (e: ClipboardEvent) => { if (!isField(e.target)) e.preventDefault() }
    const blockMenu = (e: MouseEvent) => { if (!isField(e.target)) e.preventDefault() }
    const blockDrag = (e: DragEvent) => { if (!isField(e.target)) e.preventDefault() }

    window.addEventListener('blur', hide)
    const onFocus = () => setShield(false) // back in the window: always unhide
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    document.addEventListener('copy', blockCopy)
    document.addEventListener('cut', blockCopy)
    document.addEventListener('contextmenu', blockMenu)
    document.addEventListener('dragstart', blockDrag)
    return () => {
      clearTimeout(flashTimer)
      window.removeEventListener('blur', hide)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
      document.removeEventListener('copy', blockCopy)
      document.removeEventListener('cut', blockCopy)
      document.removeEventListener('contextmenu', blockMenu)
      document.removeEventListener('dragstart', blockDrag)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('shielded', shield)
  }, [shield])

  return createPortal(
    <>
      <div className="shield-cover" aria-hidden onPointerDown={() => setShield(false)}>
        <div className="brand" style={{ fontSize: 40 }}>CU <span className="slash">FORUM</span></div>
        <div className="meta">Hidden while the app is in the background. Tap to continue.</div>
      </div>
    </>,
    document.body,
  )
}
