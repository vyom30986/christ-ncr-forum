import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { startTour } from './Tour'
import { setNationality } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { useTheme, type ThemePref } from '../hooks/useTheme'
import { initials } from '../lib/labels'
import { Sheet } from './Sheet'
import { InstallHowSheet, useInstall } from './InstallPrompt'
import { ContactSheet } from './ContactSheet'

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="row" style={{ justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
    <span style={{ color: 'var(--meta)', fontWeight: 600 }}>{k}</span>
    <span style={{ fontWeight: 700, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
  </div>
)

/** Top-left settings button: opens the profile + settings panel. */
export function SettingsMenu() {
  const { profile, session } = useAuth()
  const [open, setOpen] = useState(false)
  const name = profile?.name ?? session?.user.email?.split('@')[0] ?? 'You'
  return (
    <>
      <button className="btn btn-icon settings-btn" aria-label="Profile and settings" onClick={() => setOpen(true)}
        style={{ background: 'var(--yellow)', color: '#0A0A0A', borderColor: '#0A0A0A', fontWeight: 800, fontSize: 14 }}>
        {initials(name)}
      </button>
      <SettingsSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** The profile + settings panel itself (also opened from the Settings tab). */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inst = useInstall()
  const { profile, session, isAdmin, isOwner, signOut, refreshProfile } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const replayTour = () => { onClose(); if (loc.pathname !== '/') { try { sessionStorage.setItem('christncr.tour.replay', '1') } catch { /* ignore */ } nav('/') } else startTour() }
  const toast = useToast()
  const [editingNat, setEditingNat] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [nat, setNat] = useState('')
  const [saving, setSaving] = useState(false)
  const { pref, setPref } = useTheme()
  const name = profile?.name ?? session?.user.email?.split('@')[0] ?? 'You'
  const email = profile?.email ?? session?.user.email ?? ''
  const course = profile?.course ?? null

  const saveNat = async () => {
    if (saving) return
    if (nat.trim() && nat.trim().length < 2) { toast('Nationality needs at least 2 characters.', 'err'); return }
    setSaving(true)
    try { await setNationality(nat); await refreshProfile(); setEditingNat(false); toast('Saved.') }
    catch (e) { toast((e as Error).message, 'err') } finally { setSaving(false) }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose}>
        <div className="row" style={{ gap: 14 }}>
          <span style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--yellow)', color: '#0A0A0A', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800, flexShrink: 0 }}>
            {initials(name)}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span className="row" style={{ gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>{name}</span>
              {isAdmin && <span className="pill-tag" style={{ background: 'var(--christncr)', color: 'var(--on-christncr)' }}>{isOwner ? 'Super admin' : 'Admin · view only'}</span>}
            </span>
            <span style={{ fontSize: 13, color: 'var(--meta)', wordBreak: 'break-all' }}>{email}</span>
          </span>
        </div>

        <div>
          <Row k="Course" v={course ?? '—'} />
          <Row k="Nationality" v={
            editingNat ? (
              <span className="row" style={{ gap: 6 }}>
                <input className="input" style={{ height: 36, width: 160, fontSize: 13 }} value={nat} maxLength={60} placeholder="e.g. Indian" autoFocus
                  onChange={(e) => setNat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNat()} />
                <button className="btn btn-primary sm" style={{ height: 36 }} disabled={saving} onClick={saveNat}>Save</button>
              </span>
            ) : (
              <button style={{ border: 'none', background: 'none', fontWeight: 700, color: profile?.nationality ? 'var(--fg)' : 'var(--christncr)', padding: 0 }}
                onClick={() => { setNat(profile?.nationality ?? ''); setEditingNat(true) }}>
                {profile?.nationality ?? 'Add nationality'}
              </button>
            )
          } />
          <Row k="Role" v={isOwner ? 'Super admin' : isAdmin ? 'Admin (view only)' : 'Student'} />
        </div>
        <div className="meta" style={{ fontSize: 12 }}>
          Read from your @christuniversity.in address. Other students never see your name or course on your posts.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="label">Theme</div>
          <div className="row" style={{ gap: 6 }}>
            {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
              <button key={t} className={`sortpill ${pref === t ? 'on' : ''}`} onClick={() => setPref(t)}>
                {t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>


        {!inst.installed && <button className="btn btn-ghost" onClick={inst.install}>Add to home screen</button>}
        <button className="btn btn-ghost" onClick={() => { onClose(); setContactOpen(true) }}>✉ Contact us</button>
        <button className="btn btn-ghost" onClick={replayTour}>Show me around again</button>
        <button className="btn btn-ghost" style={{ borderColor: 'var(--pink)', color: 'var(--pink)' }} onClick={signOut}>Sign out</button>
      </Sheet>
      <InstallHowSheet open={inst.howOpen} onClose={inst.closeHow} />
      <ContactSheet open={contactOpen} onClose={() => setContactOpen(false)} defaultName={name} defaultContact={email} />
    </>
  )
}
