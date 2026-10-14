import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { supabaseConfigured } from './lib/supabase'
import { DEMO } from './lib/demo'
import Login from './screens/Login'
import Feed from './screens/Feed'
import Welcome from './screens/Welcome'
import Compose from './screens/Compose'
import Detail from './screens/Detail'
import Mine from './screens/Mine'
import Admin from './screens/Admin'
import AdminUsers from './screens/AdminUsers'
import AdminUser from './screens/AdminUser'
import AdminAccess from './screens/AdminAccess'
import AdminMessages from './screens/AdminMessages'
import { CheckinPrompt } from './components/CheckinPrompt'
import { TetrisLoader } from './components/TetrisLoader'

function Splash() {
  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', background: '#0A0A0A', color: '#fff', gap: 8 }}>
      <div className="brand" style={{ fontSize: 44 }}>CU <span style={{ color: '#93c5fd' }}>FORUM</span></div>
      <div style={{ ['--card' as string]: '#161616', ['--bg' as string]: '#0A0A0A', ['--meta' as string]: '#9A9A9A' }}>
        <TetrisLoader size={16} label="Signing you in…" />
      </div>
    </div>
  )
}

function RequireAuth({ children, admin, owner }: { children: React.ReactElement; admin?: boolean; owner?: boolean }) {
  const { loading, session, isAdmin, isOwner, profile } = useAuth()
  const loc = useLocation()
  if (loading) return <Splash />
  // Keep the query string and hash: Supabase reports OAuth failures there,
  // and Login.tsx turns them into a readable message.
  if (!session) return <Navigate to={{ pathname: '/login', search: loc.search, hash: loc.hash }} replace state={{ from: loc.pathname }} />
  if (admin && !isAdmin) return <Navigate to="/" replace />
  if (owner && !isOwner) return <Navigate to={isAdmin ? '/admin' : '/'} replace />
  // First visit: nationality + who is complaining, before anything else.
  if (profile && !profile.onboarded_at && loc.pathname !== '/welcome') return <Navigate to="/welcome" replace />
  return <>{children}<CheckinPrompt /></>
}

/** Readable by anyone. Signed-in users still go through onboarding first. */
function GuestOk({ children }: { children: React.ReactElement }) {
  const { loading, session } = useAuth()
  if (loading) return <Splash />
  if (session) return <RequireAuth>{children}</RequireAuth>
  return children
}

export default function App() {
  const { pathname } = useLocation()
  if (!supabaseConfigured && !DEMO) {
    return (
      <div className="screen" style={{ padding: 24, gap: 12 }}>
        <div className="h1">Christ NCR Forum</div>
        <div className="meta">Missing <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>. Copy <code>.env.example</code> to <code>.env</code> and fill them in.</div>
      </div>
    )
  }
  return (
    <div className="page" key={pathname}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/welcome" element={<RequireAuth><Welcome /></RequireAuth>} />
      <Route path="/" element={<GuestOk><Feed /></GuestOk>} />
      <Route path="/new" element={<RequireAuth><Compose /></RequireAuth>} />
      <Route path="/c/:id" element={<GuestOk><Detail /></GuestOk>} />
      <Route path="/mine" element={<RequireAuth><Mine /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
      <Route path="/admin/users" element={<RequireAuth admin><AdminUsers /></RequireAuth>} />
      <Route path="/admin/users/:id" element={<RequireAuth admin><AdminUser /></RequireAuth>} />
      <Route path="/admin/access" element={<RequireAuth admin><AdminAccess /></RequireAuth>} />
      <Route path="/admin/messages" element={<RequireAuth admin owner><AdminMessages /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </div>
  )
}
