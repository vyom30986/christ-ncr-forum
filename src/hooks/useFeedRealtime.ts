import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { DEMO, onDemoChange } from '../lib/demo'

/**
 * One shared subscription to the private "feed" broadcast topic (fed by DB
 * triggers). Screens register a listener; the channel is created for the
 * first listener and torn down after the last one leaves, so navigating
 * Feed -> Detail -> Feed never races a leaving channel against a new one
 * (supabase-js returns the same channel object for the same topic).
 */
type Listener = (ids: string[]) => void
const listeners = new Set<Listener>()
let channel: ReturnType<typeof supabase.channel> | null = null
let teardown: Promise<void> | null = null
let pollTimer: number | undefined

const fanout = (ids: string[]) => listeners.forEach((l) => l(ids))

async function ensureChannel() {
  if (teardown) await teardown // wait for a previous channel to fully leave
  if (channel || listeners.size === 0) return
  await supabase.realtime.setAuth() // use the signed-in user's JWT for the private topic
  if (channel || listeners.size === 0) return
  const mine = supabase
    .channel('feed', { config: { private: true } })
    .on('broadcast', { event: 'complaint' }, (msg) => fanout([(msg.payload as { id?: string })?.id].filter(Boolean) as string[]))
  channel = mine
  mine.subscribe((status, err) => {
      if (channel !== mine) return // released while this callback was in flight
      if (status === 'SUBSCRIBED') {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Realtime unavailable (RLS, expired token, feature off): fall back to polling.
        console.warn('[feed realtime]', status, err?.message ?? '')
        if (!pollTimer) pollTimer = window.setInterval(() => fanout([]), 30_000)
      }
    })
}

function releaseChannel() {
  if (listeners.size > 0) return
  if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined }
  if (!channel) return
  const c = channel
  channel = null
  teardown = supabase.removeChannel(c).then(() => { teardown = null }, () => { teardown = null })
}

/**
 * Calls `onChange` (debounced) whenever any complaint changes, and when the
 * tab regains focus so the board is fresh after the phone wakes.
 */
export function useFeedRealtime(onChange: Listener, enabled = true) {
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    if (!enabled) return
    let pending = new Set<string>()
    let timer: number | undefined
    const flush = () => {
      timer = undefined
      const ids = [...pending]
      pending = new Set()
      cb.current(ids)
    }
    const schedule = (ids: string[] = []) => {
      ids.forEach((id) => pending.add(id))
      if (!timer) timer = window.setTimeout(flush, 250)
    }

    const listener: Listener = schedule
    const offDemo = DEMO ? onDemoChange(() => schedule()) : undefined
    if (!DEMO) {
      listeners.add(listener)
      void ensureChannel()
    }

    const onVis = () => { if (!document.hidden) schedule() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)

    return () => {
      offDemo?.()
      if (timer) clearTimeout(timer)
      if (!DEMO) {
        listeners.delete(listener)
        // Give the next screen a tick to register before tearing down.
        setTimeout(releaseChannel, 100)
      }
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [enabled])
}
