import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { completeOnboarding } from '../lib/api'
import { initials } from '../lib/labels'
import { TetrisLoader } from '../components/TetrisLoader'

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="row" style={{ justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
    <span style={{ color: 'var(--meta)' }}>{k}</span>
    <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
  </div>
)

/** First visit after sign-in: confirm who you are and add nationality. Accounts are always the student's own. */
export default function Welcome() {
  const { profile, loading, refreshProfile } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [nat, setNat] = useState(profile?.nationality ?? '')
  const [saving, setSaving] = useState(false)
  // Staff and other non-standard addresses: nothing could be read from the email,
  // so the name must be typed. Student addresses come pre-filled and locked.
  const [typedName, setTypedName] = useState('')

  if (loading || !profile) return <div className="screen" style={{ justifyContent: 'center' }}><TetrisLoader label="Setting things up…" /></div>
  if (profile.onboarded_at) return <Navigate to="/" replace />

  const unparsed = !profile.course
  const nameOk = !unparsed || typedName.trim().length >= 2
  const canSave = nat.trim().length >= 2 && nameOk
  const shownName = unparsed ? (typedName.trim() || 'Your name') : profile.name
  const firstName = (unparsed ? typedName.trim() : profile.name).split(' ')[0]

  const save = async () => {
    if (nat.trim().length < 2) { toast('Please enter your nationality.', 'err'); return }
    if (unparsed && typedName.trim().length < 2) { toast('Please enter your name.', 'err'); return }
    setSaving(true)
    try {
      await completeOnboarding(nat.trim(), 'student', unparsed ? typedName.trim() : undefined)
      await refreshProfile()
      toast(`Welcome, ${firstName}.`)
      nav('/', { replace: true })
    } catch (e) {
      toast((e as Error).message, 'err')
      setSaving(false)
    }
  }

  return (
    <div className="screen">
      <div className="screen-scroll" style={{ paddingTop: 28, gap: 18 }}>
        <div>
          <div className="brand" style={{ fontSize: 40, lineHeight: 1 }}>CU <span className="slash">FORUM</span></div>
          <div className="h1" style={{ marginTop: 14 }}>Before you start</div>
          <div className="meta" style={{ marginTop: 6, lineHeight: 1.45 }}>{unparsed ? 'Your address is not a student address, so we could not read your details. Fill them in and you\'re in.' : 'This is what we know from your Christ NCR email. One quick thing and you\'re in.'}</div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ gap: 14, marginBottom: 6 }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--yellow)', color: '#0A0A0A', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800, flexShrink: 0 }}>
              {initials(unparsed ? (typedName.trim() || '?') : profile.name)}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: unparsed && !typedName.trim() ? 'var(--meta)' : undefined }}>{shownName}</span>
              <span style={{ fontSize: 13, color: 'var(--meta)', wordBreak: 'break-all' }}>{profile.email}</span>
            </span>
          </div>
          {unparsed ? (
            <Row k="Account type" v={profile.role === 'admin' ? 'Staff · Admin' : 'Staff / other'} />
          ) : (
            <>
              <Row k="Course" v={profile.course ?? '—'} />
              <Row k="Role" v={profile.role === 'admin' ? 'Admin' : 'Student'} />
            </>
          )}
        </div>

        {unparsed && (
          <div>
            <label className="label" htmlFor="fullname" style={{ display: 'block', marginBottom: 8 }}>Your full name <span style={{ color: 'var(--pink)' }}>*</span></label>
            <input id="fullname" className="input" style={{ width: '100%', height: 52, fontSize: 16 }} value={typedName} maxLength={80}
              placeholder="First name and surname" autoComplete="name" autoFocus onChange={(e) => setTypedName(e.target.value)} />
            <div className="meta" style={{ fontSize: 12, marginTop: 6 }}>Required. This is the name admins and the directory will show.</div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="nat" style={{ display: 'block', marginBottom: 8 }}>Your nationality</label>
          <input id="nat" className="input" style={{ width: '100%', height: 52, fontSize: 16 }} value={nat} maxLength={60}
            placeholder="e.g. Indian" autoComplete="country-name" onChange={(e) => setNat(e.target.value)} />
        </div>


        <button className="btn btn-primary" style={{ height: 60, fontSize: 18 }} disabled={!canSave || saving} onClick={save}>
          {saving ? 'Saving…' : 'Continue to the board'}
        </button>
      </div>
    </div>
  )
}
