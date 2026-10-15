import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { DEMO, DEMO_PROFILE } from '../lib/demo'

type AuthState = {
  loading: boolean
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  /** The super admin (owner). Every other admin is view-only. */
  isOwner: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  if (DEMO) return <DemoAuthProvider>{children}</DemoAuthProvider>
  return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
}

/** Demo mode: a fake signed-in admin, no network. */
function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => sessionStorage.getItem('christncr.demo') === '1')
  const session = signedIn ? ({ user: { id: DEMO_PROFILE.id, email: DEMO_PROFILE.email } } as unknown as Session) : null
  return (
    <Ctx.Provider value={{
      loading: false, session, profile: signedIn ? DEMO_PROFILE : null, isAdmin: signedIn, isOwner: signedIn,
      signIn: async () => { sessionStorage.setItem('christncr.demo', '1'); setSignedIn(true) },
      signOut: async () => { sessionStorage.removeItem('christncr.demo'); setSignedIn(false) },
      refreshProfile: async () => { setSignedIn((s) => s) },
    }}>{children}</Ctx.Provider>
  )
}

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s)
      if (!s) { setProfile(null); setIsAdmin(false); setIsOwner(false); setLoading(false) }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) return
    let alive = true
    setLoading(true) // profile + admin flag are unknown until this finishes
    ;(async () => {
      // The profile row is created by a trigger on first login; retry briefly
      // in case we race it.
      let prof: Profile | null = null
      for (let i = 0; i < 5 && !prof; i++) {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
        prof = (data as Profile | null) ?? null
        if (!prof) await new Promise((r) => setTimeout(r, 400))
      }
      const [{ data: admin }, { data: owner }] = await Promise.all([supabase.rpc('is_admin'), supabase.rpc('is_owner')])
      if (!alive) return
      if (!prof) {
        // The trigger that creates the profile did not run. Sign out so the
        // next sign-in starts clean instead of leaving a half-working session.
        console.error('No profile row for', session.user.id)
        try { sessionStorage.setItem('christncr.auth.error', 'Your account was not set up correctly. Please sign in again; if it keeps happening, tell an admin.') } catch { /* ignore */ }
        try { await supabase.auth.signOut() } catch { /* offline: fall through */ } finally { setLoading(false) }
        return
      }
      setProfile(prof)
      setIsAdmin(Boolean(admin))
      setIsOwner(Boolean(owner))
      setLoading(false)
    })()
    return () => { alive = false }
  }, [session?.user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async () => {
    // Fail with a readable message instead of bouncing to a JSON error page
    // when the Google provider hasn't been switched on in Supabase yet.
    try {
      const base = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string } })
      const settings = await res.json()
      if (settings?.external && settings.external.google === false) {
        throw new Error('Google sign-in is not enabled on the Supabase project yet. Enable it under Authentication → Providers → Google.')
      }
    } catch (e) {
      if ((e as Error).message.startsWith('Google sign-in')) throw e
      // network hiccup: fall through and let the real flow report
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Land on /login so a failed sign-in shows its error instead of a silent home page.
        redirectTo: `${window.location.origin}/login`,
        // Always show Google's account chooser. The @christuniversity.in rule is
        // enforced by the enforce_christncr_domain trigger in the database, so no
        // hd= filter here: on Android it hides the chooser and shows an email box.
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) throw error
  }

  const signOut = async () => { await supabase.auth.signOut() }

  const refreshProfile = async () => {
    if (!session) return
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    if (data) setProfile(data as Profile)
  }

  return <Ctx.Provider value={{ loading, session, profile, isAdmin, isOwner, signIn, signOut, refreshProfile }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
