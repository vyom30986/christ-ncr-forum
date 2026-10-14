import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { GearIcon, GridIcon, PlusIcon, ShieldIcon, UserIcon } from './Icons'
import { SignInSheet } from './SignInNeeded'
import { SettingsSheet } from './SettingsMenu'
import { useAuth } from '../hooks/useAuth'
import { ThemeToggle } from './ThemeToggle'

/** Bottom tab bar on phones; a left rail on desktop (see index.css). */
export function BottomNav() {
  const { isAdmin, profile, session } = useAuth()
  const [needSignIn, setNeedSignIn] = useState(false)
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')
  const [settings, setSettings] = useState(false)
  if (!session) {
    return (
      <nav className="bottomnav">
        <div className="rail-only rail-brand brand">CU <span className="slash">FORUM</span></div>
        <NavLink to="/" end className={cls}><GridIcon />Feed</NavLink>
        <NavLink to="/login" state={{ from: '/' }} className={cls}><UserIcon />Sign in</NavLink>
        <div className="rail-only rail-foot">
          <button className="btn btn-primary sm" style={{ height: 48, justifyContent: 'flex-start', gap: 12, padding: '0 14px', borderRadius: 14 }} onClick={() => setNeedSignIn(true)}>
            <PlusIcon size={20} />New complaint
          </button>
          <ThemeToggle label />
        </div>
        <SignInSheet open={needSignIn} onClose={() => setNeedSignIn(false)} action="post a complaint" />
      </nav>
    )
  }
  return (
    <nav className="bottomnav">
      <div className="rail-only rail-brand brand">CU <span className="slash">FORUM</span></div>
      <NavLink to="/" end className={cls}><GridIcon />Feed</NavLink>
      <NavLink to="/mine" className={cls} data-tour="mine"><UserIcon />Mine</NavLink>
      {isAdmin && <NavLink to="/admin" className={cls} data-tour="admin"><ShieldIcon />Admin</NavLink>}
      <a href="#settings" className="navbtn" data-tour="settings" onClick={(e) => { e.preventDefault(); setSettings(true) }}><GearIcon />Settings</a>
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
      <div className="rail-only rail-foot">
        <NavLink to="/new" className="btn btn-primary sm" style={{ height: 48, justifyContent: 'flex-start', gap: 12, padding: '0 14px', borderRadius: 14 }}>
          <PlusIcon size={20} />New complaint
        </NavLink>
        <ThemeToggle label />
        {profile && <div className="meta" style={{ fontSize: 12, padding: '4px 14px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.email}</div>}
      </div>
    </nav>
  )
}
