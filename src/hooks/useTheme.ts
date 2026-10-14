import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'christncr.theme'
const mq = window.matchMedia('(prefers-color-scheme: dark)')

const read = (): ThemePref => {
  try { return (localStorage.getItem(KEY) as ThemePref) || 'system' } catch { return 'system' }
}

let pref: ThemePref = read()
const listeners = new Set<() => void>()

export const isDark = (p: ThemePref = pref) => p === 'dark' || (p === 'system' && mq.matches)

function apply() {
  const dark = isDark()
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0A0A0A' : '#FFFFFF')
  listeners.forEach((l) => l())
}

export function setThemePref(p: ThemePref) {
  pref = p
  try { localStorage.setItem(KEY, p) } catch { /* private mode */ }
  apply()
}

/** Flip between light and dark (leaves "system" behind). */
export const toggleTheme = () => setThemePref(isDark() ? 'light' : 'dark')

mq.addEventListener('change', () => pref === 'system' && apply())
apply() // before first paint, so there is no flash

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** Shared theme state: every component sees the same preference. */
export function useTheme() {
  const p = useSyncExternalStore(subscribe, () => pref)
  const dark = useSyncExternalStore(subscribe, () => isDark())
  return { pref: p, dark, setPref: setThemePref, toggle: toggleTheme }
}
