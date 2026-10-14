import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useFeedRealtime } from '../hooks/useFeedRealtime'
import { deleteComment, fetchAdminComments, fetchComments, postComment, reportComment, restoreComment } from '../lib/api'
import { cohortLabel, reporterLabel } from '../lib/labels'
import { shortWhen } from '../lib/time'
import { FlagSheet } from './FlagSheet'
import { Sheet } from './Sheet'
import { CommentIcon, FlagIcon, TrashIcon } from './Icons'

const MAX = 500

/** One shape for both views: students get the anonymous view, admins get names. */
type Row = {
  id: string
  body: string
  created_at: string
  course: string | null
  grad_year: number | null
  by_op: boolean
  is_mine: boolean
  has_reported: boolean
  hidden: boolean
  reports: number
  /** Admins only: "Name", "Parent of Name" or "Other (via Name)", plus email. */
  who?: string
  email?: string | null
}

/**
 * Anonymous comments under a post. Other students see only the commenter's
 * class, plus "Author" when the post's own author replies. Admins see real
 * names (each look is logged server-side); the super admin can delete any
 * comment and restore ones hidden by reports.
 */
export function Comments({ complaintId, onNeedSignIn }: { complaintId: string; onNeedSignIn: (action: string) => void }) {
  const { session, isAdmin, isOwner } = useAuth()
  const toast = useToast()
  const userId = session?.user.id ?? ''
  const [rows, setRows] = useState<Row[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [reporting, setReporting] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState<Row | null>(null)

  const load = useCallback(async () => {
    try {
      if (isAdmin) {
        const list = await fetchAdminComments(complaintId)
        setRows(list.map((c) => ({
          id: c.id, body: c.body, created_at: c.created_at, course: c.course, grad_year: c.grad_year, by_op: c.by_op,
          is_mine: c.author_id === userId, has_reported: false, hidden: c.hidden, reports: c.reports,
          who: reporterLabel(c.name, c.reporter_kind), email: c.email,
        })))
      } else {
        const list = await fetchComments(complaintId)
        setRows(list.map((c) => ({ ...c, is_mine: Boolean(c.is_mine), hidden: false, reports: 0 })))
      }
    } catch (e) {
      toast((e as Error).message, 'err')
      setRows((prev) => prev ?? [])
    }
  }, [complaintId, isAdmin, userId, toast])

  useEffect(() => { load() }, [load])
  useFeedRealtime((ids) => { if (ids.length === 0 || ids.includes(complaintId)) load() })

  const send = async () => {
    if (!session) { onNeedSignIn('comment'); return }
    const t = text.trim()
    if (t.length < 2) return
    setBusy(true)
    try { await postComment(complaintId, userId, t); setText(''); await load() }
    catch (e) { toast((e as Error).message, 'err') }
    finally { setBusy(false) }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try { await deleteComment(deleting.id); setRows((p) => p?.filter((x) => x.id !== deleting.id) ?? p); setDeleting(null); toast('Comment deleted.') }
    catch (e) { toast((e as Error).message, 'err') }
    finally { setBusy(false) }
  }

  const restore = async (c: Row) => {
    try { await restoreComment(c.id); toast('Comment restored and reports cleared.'); load() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  const visible = rows?.filter((c) => !c.hidden).length ?? 0

  return (
    <div className="comments" id="comments">
      <div className="row" style={{ gap: 8 }}>
        <CommentIcon size={16} />
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Comments{visible ? ` · ${visible}` : ''}</span>
      </div>
      <div className="meta" style={{ fontSize: 12, marginTop: -4 }}>Anonymous: other students only see the commenter's class.</div>

      {rows === null && <div className="meta">Loading comments…</div>}
      {rows?.length === 0 && <div className="meta" style={{ fontSize: 13 }}>No comments yet. Add context, a workaround, or say it's happening to you too.</div>}

      {rows?.map((c) => (
        <div key={c.id} className={`comment ${c.hidden ? 'is-hidden' : ''}`}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="pill-cohort on-bg">{c.course || c.grad_year ? cohortLabel(c.course, c.grad_year) : 'Anonymous'}</span>
            {c.by_op && <span className="pill-tag op-tag">Author</span>}
            {c.is_mine && <span className="pill-tag" style={{ background: 'var(--bg)', color: 'var(--christncr)' }}>You</span>}
            {c.hidden && <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A' }}>Hidden · {c.reports} reports</span>}
            {!c.hidden && c.reports > 0 && <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A' }}>{c.reports} report{c.reports === 1 ? '' : 's'}</span>}
            <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--meta)' }}>{shortWhen(c.created_at)}</span>
          </div>
          {c.who && <div className="comment-who">{c.who}{c.email ? ` · ${c.email}` : ''}</div>}
          <div className="comment-body">{c.body}</div>
          <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
            {isOwner && c.hidden && <button className="btn comment-act" onClick={() => restore(c)}>Restore</button>}
            {(c.is_mine || isOwner) && (
              <button className="btn comment-act" onClick={() => setDeleting(c)}><TrashIcon size={14} />Delete</button>
            )}
            {!c.is_mine && !isAdmin && (
              <button className="btn comment-act" disabled={c.has_reported} onClick={() => (session ? setReporting(c) : onNeedSignIn('report a comment'))}>
                <FlagIcon size={14} />{c.has_reported ? 'Reported' : 'Report'}
              </button>
            )}
          </div>
        </div>
      ))}

      {session ? (
        <div className="comment-box">
          <textarea className="textarea comment-input" maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment. Other students only see your class." aria-label="Write a comment" />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="tnum" style={{ fontSize: 12, color: 'var(--meta)' }}>{text.length} / {MAX}</span>
            <button className="btn btn-primary sm" disabled={busy || text.trim().length < 2} onClick={send}>{busy ? 'Posting…' : 'Comment'}</button>
          </div>
        </div>
      ) : (
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => onNeedSignIn('comment')}><CommentIcon size={16} />Sign in to comment</button>
      )}

      <FlagSheet what="comment" open={Boolean(reporting)} onClose={() => setReporting(null)} onSubmit={async (reason) => {
        const c = reporting!
        setRows((p) => p?.map((x) => (x.id === c.id ? { ...x, has_reported: true } : x)) ?? p)
        try { await reportComment(c.id, userId, reason); toast('Reported. Admins will take a look.') }
        catch (e) { toast((e as Error).message, 'err'); load() }
      }} />

      <Sheet open={Boolean(deleting)} onClose={() => !busy && setDeleting(null)}>
        <div className="h2">Delete this comment?</div>
        <div className="meta">It disappears for everyone. This can't be undone.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => setDeleting(null)}>Keep</button>
          <button className="btn btn-solid" style={{ flex: 2, height: 56, borderRadius: 18, fontSize: 16 }} disabled={busy} onClick={confirmDelete}>Delete</button>
        </div>
      </Sheet>
    </div>
  )
}
