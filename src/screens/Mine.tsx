import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNow } from '../hooks/useNow'
import { useToast } from '../hooks/useToast'
import { useFeedRealtime } from '../hooks/useFeedRealtime'
import { deleteComplaint, editComplaint, fetchMine, reopenComplaint } from '../lib/api'
import { categoryLabel } from '../lib/labels'
import type { OwnComplaint } from '../lib/types'
import { reopenDaysLeft, timerLabel } from '../lib/time'
import { StatusPill, Timer } from '../components/Pills'
import { timerColor } from '../components/ComplaintCard'
import { Blocks, EMPTY_O } from '../components/Blocks'
import { BottomNav } from '../components/BottomNav'
import { Sheet } from '../components/Sheet'
import { EditIcon, RefreshIcon, TrashIcon } from '../components/Icons'
import { ThemeToggle } from '../components/ThemeToggle'
import { SettingsMenu } from '../components/SettingsMenu'
import { TetrisLoader } from '../components/TetrisLoader'

export default function Mine() {
  const { session, profile } = useAuth()
  const toast = useToast()
  const now = useNow()
  const [items, setItems] = useState<OwnComplaint[] | null>(null)
  const [editing, setEditing] = useState<OwnComplaint | null>(null)
  const [deleting, setDeleting] = useState<OwnComplaint | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setItems(await fetchMine(session!.user.id)) } catch (e) { toast((e as Error).message, 'err') }
  }, [session, toast])
  useEffect(() => { load() }, [load])
  useFeedRealtime(load)

  const startEdit = (c: OwnComplaint) => { setEditing(c); setTitle(c.title); setBody(c.body) }

  const saveEdit = async () => {
    if (!editing) return
    setBusy(true)
    try { await editComplaint(editing.id, title.trim(), body.trim()); toast('Saved.'); setEditing(null); load() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteComplaint(deleting.id)
      setItems((p) => p?.filter((x) => x.id !== deleting.id) ?? p)
      setDeleting(null); toast('Deleted.')
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  const reopen = async (c: OwnComplaint) => {
    try { await reopenComplaint(c.id); toast('Reopened. The clock restarted.'); load() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  return (
    <div className="screen wide">
      <div className="page-head" style={{ padding: '18px 16px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="row" style={{ gap: 12 }}>
          <SettingsMenu />
          <div className="h1">My complaints</div>
          <div style={{ marginLeft: 'auto' }}><ThemeToggle /></div>
        </div>
        <div className="meta">Students see these as anonymous. Admins can see they're yours.</div>
      </div>

      <div className="screen-scroll feed-list" style={{ gap: 10 }}>
        {items === null && <div className="hint"><TetrisLoader label="Finding your complaints…" /></div>}
        {items?.map((c) => {
          const canEdit = c.upvotes === 0 && c.status !== 'resolved' && c.status !== 'rejected'
          const daysLeft = c.status === 'resolved' ? reopenDaysLeft(c.resolved_at, now) : null
          return (
            <div key={c.id} className="card" style={{ padding: '14px 10px 14px 16px', gap: 10 }}>
              <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <StatusPill s={c.status} />
                    <span style={{ fontSize: 12, color: 'var(--meta)' }}>{categoryLabel(c.category)} · {c.upvotes} upvotes</span>
                    {c.is_private && <span className="pill-tag" style={{ background: 'var(--purple)', color: '#fff' }}>Private</span>}
                    {c.hidden && <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A' }}>Hidden</span>}
                    {c.escalated_at && <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A' }}>Escalated</span>}
                  </div>
                  {c.is_private || c.hidden
                    ? <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{c.title}</span>
                    : <Link to={`/c/${c.id}`} style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{c.title}</Link>}
                  <Timer text={timerLabel(c, now)} color={timerColor(c)} />
                  {c.checkin_due_at && !['resolved', 'rejected'].includes(c.status) && (
                    <span style={{ fontSize: 12, color: 'var(--meta)' }}>We'll check with you {new Date(c.checkin_due_at).getTime() <= now ? 'now' : 'on ' + new Date(c.checkin_due_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{c.grace_days ? ` · ${c.grace_days} working day${c.grace_days === 1 ? '' : 's'} given` : ''}</span>
                  )}
                </div>
                <button className="btn btn-icon" style={{ background: 'var(--bg)' }} aria-label="Delete" onClick={() => setDeleting(c)}><TrashIcon /></button>
              </div>
              {(canEdit || daysLeft !== null) && (
                <div className="row" style={{ gap: 8 }}>
                  {canEdit && <button className="btn" style={{ height: 38, fontSize: 13 }} onClick={() => startEdit(c)}><EditIcon size={16} />Edit</button>}
                  {daysLeft !== null && (
                    <button className="btn" style={{ height: 38, fontSize: 13 }} onClick={() => reopen(c)}>
                      <RefreshIcon size={16} />Reopen · {daysLeft}d left
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {items?.length === 0 && (
          <div className="empty" style={{ padding: '60px 24px', gap: 16 }}>
            <Blocks rows={EMPTY_O} />
            <div className="t" style={{ fontSize: 22 }}>No complaints from you</div>
            <Link to="/new" className="btn" style={{ borderColor: 'var(--fg)' }}>Post one</Link>
          </div>
        )}

        <div className="hint" style={{ marginTop: 'auto', paddingTop: 24 }}>
          <div className="meta" style={{ fontSize: 12 }}>Signed in as {profile?.email ?? session?.user.email}. Profile, theme and sign-out are under your initials, top left.</div>
        </div>
      </div>

      <BottomNav />

      <Sheet open={Boolean(editing)} onClose={() => !busy && setEditing(null)}>
        <div className="h2">Edit complaint</div>
        <div className="meta">You can edit until someone upvotes it.</div>
        <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <div className="card" style={{ minHeight: 160 }}>
          <textarea className="textarea" style={{ fontSize: 16, minHeight: 120 }} value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} />
          <div className="tnum" style={{ fontSize: 12, color: 'var(--meta)', textAlign: 'right' }}>{body.length} / 1000</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} disabled={busy || title.trim().length < 3 || body.trim().length < 10} onClick={saveEdit}>Save</button>
        </div>
      </Sheet>

      <Sheet open={Boolean(deleting)} onClose={() => !busy && setDeleting(null)}>
        <div className="h2">Delete this complaint?</div>
        <div className="meta">It disappears from the board for everyone, upvotes included. This can't be undone.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setDeleting(null)}>Keep</button>
          <button className="btn btn-solid" style={{ flex: 2, height: 56, borderRadius: 18, fontSize: 16 }} disabled={busy} onClick={confirmDelete}>Delete</button>
        </div>
      </Sheet>
    </div>
  )
}
