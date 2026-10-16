import { useCallback, useEffect, useRef, useState } from 'react'
import { useNow } from '../hooks/useNow'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useFeedRealtime } from '../hooks/useFeedRealtime'
import {
  adminDelete, adminReply, adminRestore, adminSetStatus, fetchAdminAll, fetchAdminFlagged, fetchAdminPrivate, fetchVoters, logAdminView,
  deleteComment, fetchReportedComments, restoreComment,
} from '../lib/api'
import { STATUS, categoryLabel, cohortLabel, initials, reporterLabel } from '../lib/labels'
import type { AdminComplaint, ReportedComment, Status, Voter } from '../lib/types'
import { shortWhen, timerLabel } from '../lib/time'
import { timerColor } from '../components/ComplaintCard'
import { BottomNav } from '../components/BottomNav'
import { Sheet } from '../components/Sheet'
import { ThemeToggle } from '../components/ThemeToggle'
import { SettingsMenu } from '../components/SettingsMenu'
import { TetrisLoader } from '../components/TetrisLoader'
import { ChevronIcon, KeyIcon, UsersIcon } from '../components/Icons'
import { Link } from 'react-router-dom'

type Tab = 'all' | 'attention' | 'flags' | 'private'
type Flagged = AdminComplaint & { flag_reasons: string[] }
const AVATARS = ['var(--yellow)', 'var(--pink)', 'var(--green)', 'var(--blue)']
const STATUSES: Status[] = ['open', 'acknowledged', 'in_progress', 'resolved', 'rejected']

// ---- row pieces (module-level so they keep their DOM between renders) ----

const Escalated = ({ c }: { c: AdminComplaint }) =>
  c.escalated_at ? (
    <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A' }} title={`Student reported no promised fix on ${new Date(c.escalated_at).toLocaleString()}`}>
      ⚠ Escalated{(c.escalations ?? 0) > 1 ? ` ×${c.escalations}` : ''}
    </span>
  ) : null

function Identity({ c, i, onVoters }: { c: AdminComplaint; i: number; onVoters?: (c: AdminComplaint) => void }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: AVATARS[i % 4], color: '#0A0A0A', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
        {initials(c.profiles?.name ?? '?')}
      </span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{reporterLabel(c.profiles?.name, c.reporter_kind ?? c.profiles?.reporter_kind)}</span>
          {(() => { const k = c.reporter_kind ?? c.profiles?.reporter_kind; return k === 'parent' ? <span className="pill-tag parent-tag">PARENT</span> : k === 'other' ? <span className="pill-tag other-tag">OTHER</span> : null })()}
        </span>
        <span style={{ fontSize: 12, color: 'var(--meta)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.profiles?.email} · {cohortLabel(c.profiles?.course ?? null, c.profiles?.grad_year ?? null)}
        </span>
      </span>
      {onVoters && c.upvotes > 0 ? (
        <button className="btn sm tnum voters-btn" onClick={() => onVoters(c)} aria-label={`See who upvoted (${c.upvotes})`} title="See who upvoted">▲ {c.upvotes}</button>
      ) : (
        <span className="tnum" style={{ fontSize: 13, fontWeight: 700 }}>▲ {c.upvotes}</span>
      )}
    </div>
  )
}

function StatusRow({ c, now, onChange, readOnly }: { c: AdminComplaint; now: number; onChange: (s: Status) => void; readOnly?: boolean }) {
  if (readOnly) {
    return (
      <div className="row">
        <span className="pill-tag" style={{ background: STATUS[c.status].bg, color: STATUS[c.status].fg, padding: '6px 10px' }}>{STATUS[c.status].label}</span>
        <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: timerColor(c), whiteSpace: 'nowrap', marginLeft: 'auto' }}>{timerLabel(c, now)}</span>
      </div>
    )
  }
  return (
    <div className="row">
      <label className="selectwrap">
        <select className="select" value={c.status} onChange={(e) => onChange(e.target.value as Status)}
          style={{ background: STATUS[c.status].bg, color: STATUS[c.status].fg }} aria-label="Status">
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <ChevronIcon style={{ color: STATUS[c.status].fg }} />
      </label>
      <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: timerColor(c), whiteSpace: 'nowrap' }}>{timerLabel(c, now)}</span>
    </div>
  )
}

function ReplyRow({ onSend, busy }: { onSend: (note: string) => Promise<void>; busy: boolean }) {
  const [text, setText] = useState('')
  const send = async () => { const t = text.trim(); if (!t || busy) return; await onSend(t); setText('') }
  return (
    <div className="row">
      <input className="input" placeholder="Write an official reply…" value={text}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
      <button className="btn btn-primary sm" disabled={busy || !text.trim()} onClick={send}>Reply</button>
    </div>
  )
}

const Title = ({ c }: { c: AdminComplaint }) => (
  <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{c.title}</div>
)
const Body = ({ c }: { c: AdminComplaint }) => (
  <div style={{ fontSize: 13, color: 'var(--meta)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{c.body}</div>
)

// ---- screen ----

export default function Admin() {
  const toast = useToast()
  const now = useNow()
  const { isOwner, canDelete } = useAuth()
  const [tab, setTab] = useState<Tab>('all')
  const [all, setAll] = useState<AdminComplaint[]>([])
  const [flagged, setFlagged] = useState<Flagged[]>([])
  const [priv, setPriv] = useState<AdminComplaint[]>([])
  const [reported, setReported] = useState<ReportedComment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [rejecting, setRejecting] = useState<AdminComplaint | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [removing, setRemoving] = useState<AdminComplaint | null>(null)
  const [busy, setBusy] = useState(false)
  const [voters, setVoters] = useState<{ c: AdminComplaint; list: Voter[] | null } | null>(null)
  const openVoters = useCallback(async (c: AdminComplaint) => {
    setVoters({ c, list: null })
    try { const list = await fetchVoters(c.id); setVoters((v) => (v && v.c.id === c.id ? { c, list } : v)) }
    catch (e) { toast((e as Error).message, 'err'); setVoters(null) }
  }, [toast])

  // Identity audit: log each complaint once per visit, not on every refetch.
  const logged = useRef(new Set<string>())
  const load = useCallback(async () => {
    try {
      const [a, f, p, rc] = await Promise.all([fetchAdminAll(), fetchAdminFlagged(), fetchAdminPrivate(), fetchReportedComments()])
      setAll(a); setFlagged(f); setPriv(p); setReported(rc); setLoaded(true)
      const fresh = [...new Set([...a, ...f, ...p].map((c) => c.id))].filter((id) => !logged.current.has(id))
      fresh.forEach((id) => logged.current.add(id))
      logAdminView(fresh)
    } catch (e) { toast((e as Error).message, 'err') }
  }, [toast])
  useEffect(() => { load() }, [load])
  useFeedRealtime(load)

  const setStatus = async (c: AdminComplaint, s: Status) => {
    if (s === c.status) return
    if (s === 'rejected') { setRejecting(c); setRejectNote(''); return }
    try { await adminSetStatus(c.id, s); toast(`Marked ${STATUS[s].label.toLowerCase()}. Complainant and upvoters notified.`); load() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const sendReply = async (c: AdminComplaint, note: string) => {
    setBusy(true)
    try { await adminReply(c.id, note); toast('Reply posted and emailed.'); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const confirmReject = async () => {
    if (!rejecting) return
    setBusy(true)
    try { await adminSetStatus(rejecting.id, 'rejected', rejectNote.trim()); toast('Rejected with note.'); setRejecting(null); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const confirmRemove = async () => {
    if (!removing) return
    setBusy(true)
    try { await adminDelete(removing.id); toast('Removed.'); setRemoving(null); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const restore = async (c: AdminComplaint) => {
    try { await adminRestore(c.id); toast('Restored to the feed and flags cleared.'); load() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const attention = all.filter((c) => c.attention).sort((a, b) => b.upvotes - a.upvotes)
  const tabs: { key: Tab; label: string; count: number; countBg: string }[] = [
    { key: 'all', label: 'All', count: all.filter((c) => c.status !== 'resolved' && c.status !== 'rejected').length, countBg: tab === 'all' ? 'var(--yellow)' : 'var(--line)' },
    { key: 'attention', label: 'Attention', count: attention.length, countBg: 'var(--yellow)' },
    { key: 'flags', label: 'Flags', count: flagged.length + reported.length, countBg: 'var(--pink)' },
    { key: 'private', label: 'Private', count: priv.length, countBg: 'var(--purple)' },
  ]

  return (
    <div className="screen wide">
      <div className="row page-head" style={{ padding: '18px 16px 14px', gap: 10 }}>
        <SettingsMenu />
        <div className="h1">Admin</div>
        <span className="pill-tag hide-narrow" style={{ background: 'var(--christncr)', color: 'var(--on-christncr)', padding: '5px 9px' }}>{isOwner ? 'Super admin' : canDelete ? 'Can delete' : 'View only'}</span>
        <div style={{ marginLeft: 'auto' }}><ThemeToggle /></div>
      </div>
      <div className="page-head row" style={{ padding: '0 16px 12px', gap: 8 }}>
        <Link to="/admin/users" className="btn" style={{ height: 38, fontSize: 13 }}><UsersIcon size={16} />Users</Link>
        <Link to="/admin/access" className="btn" style={{ height: 38, fontSize: 13 }}><KeyIcon size={16} />Access</Link>
        {isOwner && <Link to="/admin/messages" className="btn" style={{ height: 38, fontSize: 13 }}>✉ Messages</Link>}
      </div>
      {!isOwner && (
        <div className="page-head" style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ padding: '10px 14px', borderLeft: '4px solid var(--blue)', fontSize: 13, lineHeight: 1.45 }}>
            {canDelete
              ? <><b>Delete access.</b> You can see complaints, names and votes, and delete complaints. Only the super admin can change statuses, reply or restore.</>
              : <><b>View-only access.</b> You can see complaints, names and votes. Only the super admin can change statuses, reply, restore or delete.</>}
          </div>
        </div>
      )}

      <div className="page-head" style={{ padding: '0 16px 14px' }}>
        <div style={{ display: 'flex', background: 'var(--card)', borderRadius: 16, padding: 4, gap: 4, maxWidth: 640 }} role="tablist">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, height: 44, borderRadius: 12, border: 'none', background: tab === t.key ? 'var(--bg)' : 'transparent', color: tab === t.key ? 'var(--fg)' : 'var(--meta)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              {t.label}
              <span style={{ fontSize: 11, minWidth: 20, height: 20, borderRadius: 6, background: t.countBg, color: '#0A0A0A', display: 'grid', placeItems: 'center', padding: '0 4px' }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="screen-scroll feed-list">
        {!loaded && <div className="hint"><TetrisLoader label="Loading complaints…" /></div>}

        {(tab === 'all' || tab === 'attention') && loaded && (
          <>
            {tab === 'attention' && <div className="hint" style={{ fontSize: 13, color: 'var(--meta)', lineHeight: 1.4 }}>Posts with more than 50 upvotes. They move here automatically as votes come in.</div>}
            {tab === 'all' && all.length === 0 && <div className="meta">Nothing on the board yet.</div>}
            {tab === 'attention' && attention.length === 0 && <div className="meta">Nothing needs attention right now.</div>}
            {(tab === 'attention' ? attention : all).map((c, i) => (
              <div key={c.id} className="card-outline" style={c.escalated_at ? { borderColor: 'var(--pink)' } : undefined}>
                <Identity c={c} i={i} onVoters={openVoters} />
                {c.attention && (
                  <div className="row" style={{ gap: 8 }}>
                    <span className="pill-tag" style={{ background: 'var(--yellow)', color: '#0A0A0A' }}>★ Attention needed</span>
                    <span style={{ fontSize: 12, color: 'var(--meta)' }}>{c.upvotes} upvotes</span>
                  </div>
                )}
                {c.escalated_at && (
                  <div className="row" style={{ gap: 8 }}>
                    <Escalated c={c} />
                    <span style={{ fontSize: 12, color: 'var(--meta)' }}>Student says it's unsolved and nothing was promised. People in charge emailed.</span>
                  </div>
                )}
                <Title c={c} />
                <Body c={c} />
                <StatusRow c={c} now={now} onChange={(s) => setStatus(c, s)} readOnly={!isOwner} />
                {isOwner && <ReplyRow busy={busy} onSend={(note) => sendReply(c, note)} />}
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--meta)' }}>{categoryLabel(c.category)}{c.flags > 0 ? ` · ${c.flags} flag${c.flags > 1 ? 's' : ''}` : ''}</span>
                  {canDelete && <button className="btn" style={{ height: 34, fontSize: 12, color: 'var(--pink)', borderColor: 'transparent' }} onClick={() => setRemoving(c)}>Delete</button>}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'flags' && loaded && (
          <>
            <div className="hint" style={{ fontSize: 13, color: 'var(--meta)', lineHeight: 1.4 }}>Posts with 3+ flags are hidden from the feed until reviewed.</div>
            {flagged.length === 0 && reported.length === 0 && <div className="meta">Queue is empty.</div>}
            {flagged.map((c) => (
              <div key={c.id} className="card-outline" style={{ borderColor: 'var(--pink)' }}>
                <div className="row">
                  <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A', padding: '5px 9px' }}>🚩 {c.flags} flag{c.flags === 1 ? '' : 's'}{c.hidden ? ' · hidden' : ''}</span>
                  <span style={{ fontSize: 12, color: 'var(--meta)' }}>{categoryLabel(c.category)}</span>
                </div>
                <Title c={c} />
                <Body c={c} />
                {c.flag_reasons.length > 0 && <div style={{ fontSize: 12, color: 'var(--meta)' }}>Reasons: {c.flag_reasons.join(' · ')}</div>}
                <div style={{ fontSize: 12, color: 'var(--meta)' }}>{c.profiles?.name} · {c.profiles?.email}</div>
                {canDelete && (
                <div className="row">
                  {isOwner && <button className="btn" style={{ flex: 1, borderRadius: 12 }} onClick={() => restore(c)}>{c.hidden ? 'Restore' : 'Clear flags'}</button>}
                  <button className="btn btn-solid" style={{ flex: 1 }} onClick={() => setRemoving(c)}>Remove</button>
                </div>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'flags' && loaded && reported.length > 0 && (
          <>
            <div className="hint" style={{ fontSize: 13, color: 'var(--meta)', lineHeight: 1.4, gridColumn: '1 / -1' }}>Reported comments. Three reports hide a comment until it is restored or deleted.</div>
            {reported.map((cm) => (
              <div key={cm.id} className="card-outline" style={{ borderColor: 'var(--pink)' }}>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A', padding: '5px 9px' }}>💬 {cm.reports} report{cm.reports === 1 ? '' : 's'}{cm.hidden ? ' · hidden' : ''}</span>
                  <Link to={`/c/${cm.complaint_id}#comments`} style={{ fontSize: 12, color: 'var(--meta)', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>On: {cm.complaint_title}</Link>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{cm.body}</div>
                {cm.reasons.length > 0 && <div style={{ fontSize: 12, color: 'var(--meta)' }}>Reasons: {cm.reasons.join(' · ')}</div>}
                <div style={{ fontSize: 12, color: 'var(--meta)' }}>{reporterLabel(cm.name, cm.reporter_kind)} · {cm.email}</div>
                {isOwner && (
                  <div className="row">
                    <button className="btn" style={{ flex: 1, borderRadius: 12 }} onClick={async () => { try { await restoreComment(cm.id); toast('Comment restored and reports cleared.'); load() } catch (e) { toast((e as Error).message, 'err') } }}>{cm.hidden ? 'Restore' : 'Clear reports'}</button>
                    <button className="btn btn-solid" style={{ flex: 1 }} onClick={async () => { try { await deleteComment(cm.id); toast('Comment deleted.'); load() } catch (e) { toast((e as Error).message, 'err') } }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'private' && loaded && (
          <>
            <div className="hint" style={{ fontSize: 13, color: 'var(--meta)', lineHeight: 1.4 }}>Safety and harassment reports. Never shown on the feed.</div>
            {priv.length === 0 && <div className="meta">No private reports.</div>}
            {priv.map((c) => (
              <div key={c.id} className="card-outline" style={{ borderColor: 'var(--purple)' }}>
                <div className="row">
                  <span className="pill-tag" style={{ background: 'var(--purple)', color: '#fff', padding: '5px 9px' }}>Private · {categoryLabel(c.category)}</span>
                  <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: timerColor(c) }}>{timerLabel(c, now)}</span>
                </div>
                <Title c={c} />
                <Body c={c} />
                <div style={{ fontSize: 12, color: 'var(--meta)' }}>{c.profiles?.name} · {c.profiles?.email}</div>
                <StatusRow c={c} now={now} onChange={(s) => setStatus(c, s)} readOnly={!isOwner} />
                {isOwner && <ReplyRow busy={busy} onSend={(note) => sendReply(c, note)} />}
                <div className="row">
                  <a className="btn" style={{ flex: 1, borderRadius: 12 }} href={`mailto:${c.profiles?.email ?? ''}?subject=${encodeURIComponent(`[Christ NCR Forum] ${c.title}`)}`}>Contact student</a>
                  {isOwner && c.status === 'open' && (
                    <button className="btn btn-primary sm" style={{ flex: 1 }} onClick={() => setStatus(c, 'acknowledged')}>Acknowledge</button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <BottomNav />

      <Sheet open={Boolean(voters)} onClose={() => setVoters(null)}>
        <div className="h2">Who upvoted{voters ? ` (${voters.c.upvotes})` : ''}</div>
        <div className="meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{voters?.c.title}</div>
        {voters && voters.list === null && <TetrisLoader label="Fetching names…" />}
        {voters?.list && voters.list.length === 0 && <div className="meta">No upvotes yet.</div>}
        {voters?.list && voters.list.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '55vh', overflowY: 'auto' }}>
            {voters.list.map((v, i) => {
              const p = v.profiles
              const kind = p?.reporter_kind
              return (
                <div key={v.user_id} className="row" style={{ gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: AVATARS[i % 4], color: '#0A0A0A', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{initials(p?.name ?? '?')}</span>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{reporterLabel(p?.name, kind)}</span>
                      {kind === 'parent' ? <span className="pill-tag parent-tag">PARENT</span> : kind === 'other' ? <span className="pill-tag other-tag">OTHER</span> : null}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--meta)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p?.email ?? 'Deleted account'}{p ? ` · ${cohortLabel(p.course, p.grad_year)}` : ''}
                    </span>
                  </span>
                  <span className="tnum" style={{ fontSize: 12, color: 'var(--meta)', flexShrink: 0 }}>{shortWhen(v.created_at)}</span>
                </div>
              )
            })}
          </div>
        )}
        <button className="btn" onClick={() => setVoters(null)}>Close</button>
      </Sheet>

      <Sheet open={Boolean(rejecting)} onClose={() => !busy && setRejecting(null)}>
        <div className="h2">Reject this complaint</div>
        <div className="meta">A note is required. The complainant and upvoters will receive it by email.</div>
        <div className="card" style={{ minHeight: 120 }}>
          <textarea className="textarea" style={{ fontSize: 16, minHeight: 90 }} placeholder="Why this won't be actioned…" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} autoFocus />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setRejecting(null)}>Cancel</button>
          <button className="btn btn-solid" style={{ flex: 2, height: 56, borderRadius: 18, fontSize: 16 }} disabled={busy || rejectNote.trim().length < 2} onClick={confirmReject}>Reject</button>
        </div>
      </Sheet>

      <Sheet open={Boolean(removing)} onClose={() => !busy && setRemoving(null)}>
        <div className="h2">Remove permanently?</div>
        <div className="meta">Deletes the complaint, its votes, flags and updates. The student won't be notified.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setRemoving(null)}>Keep</button>
          <button className="btn btn-solid" style={{ flex: 2, height: 56, borderRadius: 18, fontSize: 16 }} disabled={busy} onClick={confirmRemove}>Remove</button>
        </div>
      </Sheet>
    </div>
  )
}
