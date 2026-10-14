import { useEffect, useState } from 'react'

/** Current time, re-rendered every `every` ms (pauses while the tab is hidden). */
export function useNow(every = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let id: number | undefined
    const start = () => {
      stop()
      setNow(Date.now())
      id = window.setInterval(() => setNow(Date.now()), every)
    }
    const stop = () => { if (id) { clearInterval(id); id = undefined } }
    const onVis = () => (document.hidden ? stop() : start())
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [every])
  return now
}
