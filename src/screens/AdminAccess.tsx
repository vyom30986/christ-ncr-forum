import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { fetchAdmins, grantAdmin, revokeAdmin } from '../lib/api'
import { cohortLabel, initials } from '../lib/labels'
import type { AdminEntry } from '../lib/types'
import { shortWhen } from '../lib/time'
import { BottomNav } from '../components/BottomNav'
import { ThemeToggle } from '../components/ThemeToggle'
import { Sheet } from '../components/Sheet'
import { BackIcon, ShieldIcon } from '../components/Icons'
import { TetrisLoader } from '../components/TetrisLoader'

export default function AdminAccess() {
  const { profile, session } = useAuth()
  const toast = useToast()
  const [admins, setAdmins] = useState<AdminEntry[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<AdminEntry | null>(null)
  const me = (profile?.email ?? session?.user.email ?? '').toLowerCase()
  const owner = admins?.find((a) => a.is_owner) ?? null
  const iAmOwner = Boolean(owner && owner.email.toLowerCase() === me)

  const load = useCallback(async () => {
    try { setAdmins(await fetchAdmins()) } catch (e) { toast((e as Error).message, 'err') }
  }, [toast])
  useEffect(() => { load() }, [load])

  const valid = /^[a-z0-9._%+-]+@([a-z0-9-]+\.)*christuniversity\.in$/i.test(email.trim())

  const add = async () => {
    if (!valid) return
    setBusy(true)
    try { await grantAdmin(email.trim()); toast(`${email.trim().toLowerCase()} is now an admin.`); setEmail(''); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const confirmRemove = async () => {
    if (!removing) return
    setBusy(true)
    try { await revokeAdmin(removing.email); toast(`Removed admin access for ${removing.email}.`); setRemoving(null); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  return (
    <div className="screen wide">
      <div className="row page-head" style={{ padding: '18px 16px 6px', gap: 10 }}>
        <Link to="/admin" className="btn btn-icon" aria-label="Back to admin"><BackIcon /></Link>
        <div className="h1">Access</div>
        <div style={{ marginLeft: 'auto' }}><ThemeToggle /></div>
      </div>
      <div className="page-head meta" style={{ padding: '0 16px 16px' }}>
        The owner is the super admin and can change everything. Admins added here are view-only: they see complaints, real names, users and votes, and receive escalations, but cannot change statuses, reply, restore, delete or read Contact us messages. The owner can never be removed.
      </div>

      <div className="screen-scroll" style={{ gap: 16, maxWidth: 720 }}>
        {admins !== null && (iAmOwner ? (
          <div className="card" style={{ gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Give admin access</div>
            <div className="row">
              <input className="input" type="email" placeholder="name.surname@bbafth.christuniversity.in" value={email}
                onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} autoCapitalize="none" />
              <button className="btn btn-primary sm" disabled={busy || !valid} onClick={add}><ShieldIcon size={16} />Add</button>
            </div>
            {email && !valid && <div style={{ fontSize: 12, color: 'var(--pink)', fontWeight: 600 }}>Must be a @christuniversity.in address.</div>}
            <div className="meta" style={{ fontSize: 12 }}>Only @christuniversity.in addresses. They get view-only admin access the next time they sign in.</div>
          </div>
        ) : (
          <div className="card" style={{ gap: 6, borderLeft: '4px solid var(--christncr)' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>View only</div>
            <div className="meta" style={{ fontSize: 13 }}>
              Admin access is managed by the owner{owner ? <>, <b style={{ color: 'var(--fg)' }}>{owner.name ?? owner.email}</b></> : ''}. Ask them to add or remove admins.
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Current admins</div>
            {admins && <span className="pill-tag" style={{ background: 'var(--card)', color: 'var(--meta)' }}>{admins.length}</span>}
          </div>
          {admins === null && <TetrisLoader label="Loading admins…" />}
          {admins?.map((a, i) => {
            const isMe = a.email.toLowerCase() === me
            return (
              <div key={a.email} className="card-outline" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: a.is_owner ? 'var(--christncr)' : 'var(--line)' }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: a.is_owner ? 'var(--christncr)' : ['var(--yellow)', 'var(--green)', 'var(--blue)', 'var(--pink)', 'var(--purple)'][i % 5], color: a.is_owner ? 'var(--on-christncr)' : '#0A0A0A', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                  {initials(a.name ?? a.email)}
                </span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{a.name ?? a.email.split('@')[0]}</span>
                    {a.is_owner && <span className="pill-tag" style={{ background: 'var(--christncr)', color: 'var(--on-christncr)' }}>Owner</span>}
                    {isMe && <span className="pill-tag" style={{ background: 'var(--card)', color: 'var(--meta)' }}>You</span>}
                    {!a.signed_in && <span className="pill-tag" style={{ background: 'var(--card)', color: 'var(--meta)' }}>Not signed in yet</span>}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--meta)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.email}{a.course ? ` · ${cohortLabel(a.course, a.grad_year)}` : ''} · {a.is_owner ? 'permanent' : `added ${shortWhen(a.added_at)}`}
                  </span>
                </span>
                {iAmOwner && !a.is_owner && (
                  <button className="btn" style={{ height: 36, fontSize: 12, color: 'var(--pink)' }} disabled={busy} onClick={() => setRemoving(a)}>Remove</button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <BottomNav />

      <Sheet open={Boolean(removing)} onClose={() => !busy && setRemoving(null)}>
        <div className="h2">Remove admin access?</div>
        <div className="meta"><b style={{ color: 'var(--fg)' }}>{removing?.email}</b> will go back to a normal student account and stop receiving escalations.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setRemoving(null)}>Keep</button>
          <button className="btn btn-solid" style={{ flex: 2, height: 56, borderRadius: 18, fontSize: 16 }} disabled={busy} onClick={confirmRemove}>Remove</button>
        </div>
      </Sheet>
    </div>
  )
}
