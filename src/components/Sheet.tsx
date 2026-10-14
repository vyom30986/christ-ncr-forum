import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Body scroll lock shared by every open sheet, so two sheets closing in any
// order never leave the page stuck.
let locks = 0
const lock = () => { if (locks++ === 0) document.body.style.overflow = 'hidden' }
const unlock = () => { if (--locks <= 0) { locks = 0; document.body.style.overflow = '' } }

/**
 * Bottom sheet. Rendered into document.body via a portal so it always sits
 * above fixed elements like the nav and the "+" button, wherever it is used.
 */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    lock()
    return () => { document.removeEventListener('keydown', onKey); unlock() }
  }, [open])

  if (!open) return null
  return createPortal(
    <>
      <div className="scrim" onClick={() => onCloseRef.current()} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        {children}
      </div>
    </>,
    document.body,
  )
}
