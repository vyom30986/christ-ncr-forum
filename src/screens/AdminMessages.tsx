import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../hooks/useToast'
import { deleteContactMessage, fetchContactMessages } from '../lib/api'
import type { ContactMessage } from '../lib/types'
import { countWords } from '../components/ContactSheet'
import { BottomNav } from '../components/BottomNav'
import { ThemeToggle } from '../components/ThemeToggle'
import { Sheet } from '../components/Sheet'
import { BackIcon, RefreshIcon, TrashIcon } from '../components/Icons'
import { TetrisLoader } from '../components/TetrisLoader'

const stamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Admin: one-way "Contact us" inbox, newest first. */
export default function AdminMessages() {
  const toast = useToast()
  const [msgs, setMsgs] = useState<ContactMessage[] | null>(null)
  const [removing, setRemoving] = useState<ContactMessage | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setMsgs(await fetchContactMessages()) } catch (e) { toast((e as Error).message, 'err') }
  }, [toast])
  useEffect(() => { load() }, [load])

  const confirmRemove = async () => {
    if (!removing) return
    setBusy(true)
    try { await deleteContactMessage(removing.id); setMsgs((m) => m?.filter((x) => x.id !== removing.id) ?? m); setRemoving(null); toast('Message deleted.') }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  return (
    <div className="screen wide">
      <div className="row page-head" style={{ padding: '18px 16px 6px', gap: 10 }}>
        <Link to="/admin" className="btn btn-icon" aria-label="Back to admin"><BackIcon /></Link>
        <div className="h1">Messages</div>
        {msgs && <span className="pill-tag" style={{ background: 'var(--card)', color: 'var(--meta)' }}>{msgs.length}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-icon" aria-label="Refresh" onClick={() => { setMsgs(null); load() }}><RefreshIcon /></button>
          <ThemeToggle />
        </div>
      </div>
      <div className="page-head meta" style={{ padding: '0 16px 16px' }}>
        Sent from "Contact us" on the sign-in page or the in-app Settings menu, newest first. Signed-in senders are tagged. This inbox is one-way: there is no reply.
      </div>

      <div className="screen-scroll" style={{ gap: 12, maxWidth: 760 }}>
        {msgs === null && <TetrisLoader label="Loading messages…" />}
        {msgs?.length === 0 && <div className="meta">No messages yet.</div>}
        {msgs?.map((m) => (
          <div key={m.id} className="card-outline" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{m.name}</span>
                  {m.user_id
                    ? <span className="pill-tag" style={{ background: 'var(--green)', color: '#0A0A0A' }}>Signed in</span>
                    : <span className="pill-tag" style={{ background: 'var(--card)', color: 'var(--meta)' }}>Not signed in</span>}
                </span>
                <span style={{ fontSize: 12, color: 'var(--meta)', wordBreak: 'break-word' }}>{m.contact ?? 'No contact given'}</span>
              </span>
              <span className="tnum" style={{ fontSize: 12, color: 'var(--meta)', textAlign: 'right', flexShrink: 0 }}>{stamp(m.created_at)}</span>
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.message}</div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="tnum" style={{ fontSize: 12, color: 'var(--meta)' }}>{countWords(m.message)} words</span>
              <button className="btn" style={{ height: 34, fontSize: 12, color: 'var(--pink)' }} onClick={() => setRemoving(m)}><TrashIcon size={14} />Delete</button>
            </div>
          </div>
        ))}
      </div>

      <BottomNav />

      <Sheet open={Boolean(removing)} onClose={() => !busy && setRemoving(null)}>
        <div className="h2">Delete this message?</div>
        <div className="meta">From <b style={{ color: 'var(--fg)' }}>{removing?.name}</b>. This can't be undone.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setRemoving(null)}>Keep</button>
          <button className="btn btn-solid" style={{ flex: 2, height: 56, borderRadius: 18, fontSize: 16 }} disabled={busy} onClick={confirmRemove}>Delete</button>
        </div>
      </Sheet>
    </div>
  )
}
