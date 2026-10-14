import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Toast = { id: number; text: string; kind: 'ok' | 'err' }
const Ctx = createContext<(text: string, kind?: 'ok' | 'err') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ id: Date.now(), text, kind })
    timer.current = window.setTimeout(() => setToast(null), kind === 'err' ? 4000 : 2500)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.kind === 'err' ? 'err' : ''}`} role="status">{toast.text}</div>}
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
