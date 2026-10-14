import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../hooks/useToast'
import { fetchAdminUsers } from '../lib/api'
import { cohortLabel, initials, reporterLabel } from '../lib/labels'
import type { UserStats } from '../lib/types'
import { BottomNav } from '../components/BottomNav'
import { ThemeToggle } from '../components/ThemeToggle'
import { TetrisLoader } from '../components/TetrisLoader'
import { BackIcon } from '../components/Icons'

type SortKey = 'complaints' | 'upvotes_received' | 'open_complaints' | 'escalations' | 'votes_cast' | 'flags_cast' | 'name'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'complaints', label: 'Most complaints' },
  { key: 'open_complaints', label: 'Most open' },
  { key: 'upvotes_received', label: 'Most upvoted' },
  { key: 'escalations', label: 'Most escalated' },
  { key: 'votes_cast', label: 'Most votes cast' },
  { key: 'flags_cast', label: 'Most flags cast' },
  { key: 'name', label: 'A–Z' },
]
const AVATARS = ['var(--yellow)', 'var(--pink)', 'var(--green)', 'var(--blue)', 'var(--purple)']

export const Stat = ({ n, label, warn }: { n: number; label: string; warn?: boolean }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 64 }}>
    <span className="tnum" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: warn && n > 0 ? 'var(--pink)' : 'var(--fg)' }}>{n}</span>
    <span style={{ fontSize: 11, color: 'var(--meta)', fontWeight: 600 }}>{label}</span>
  </div>
)

export default function AdminUsers() {
  const toast = useToast()
  const [users, setUsers] = useState<UserStats[] | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('complaints')

  useEffect(() => {
    fetchAdminUsers().then(setUsers).catch((e) => toast((e as Error).message, 'err'))
  }, [toast])

  const list = useMemo(() => {
    if (!users) return null
    const needle = q.trim().toLowerCase()
    const filtered = needle
      ? users.filter((u) => [u.name, u.email, u.course ?? '', String(u.grad_year ?? ''), u.nationality ?? ''].some((s) => s.toLowerCase().includes(needle)))
      : users
    return [...filtered].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : (b[sort] as number) - (a[sort] as number) || b.complaints - a.complaints)
  }, [users, q, sort])

  const totals = useMemo(() => users ? {
    users: users.length,
    complaints: users.reduce((s, u) => s + u.complaints, 0),
    open: users.reduce((s, u) => s + u.open_complaints, 0),
    escalations: users.reduce((s, u) => s + u.escalations, 0),
  } : null, [users])

  return (
    <div className="screen wide">
      <div className="row page-head" style={{ padding: '18px 16px 6px', gap: 10 }}>
        <Link to="/admin" className="btn btn-icon" aria-label="Back to admin"><BackIcon /></Link>
        <div className="h1">Users</div>
        <span className="pill-tag" style={{ background: 'var(--christncr)', color: 'var(--on-christncr)', padding: '5px 9px' }}>Admin only</span>
        <div style={{ marginLeft: 'auto' }}><ThemeToggle /></div>
      </div>
      <div className="page-head meta" style={{ padding: '0 16px 12px' }}>
        Every signed-in account, ranked. Tap a user for the full record. Viewing this page is logged.
      </div>

      {totals && (
        <div className="page-head" style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap', padding: '14px 16px' }}>
            <Stat n={totals.users} label="users" />
            <Stat n={totals.complaints} label="complaints" />
            <Stat n={totals.open} label="open" />
            <Stat n={totals.escalations} label="escalations" warn />
          </div>
        </div>
      )}

      <div className="page-head" style={{ padding: '0 16px 10px' }}>
        <input className="input" placeholder="Search name, email, course, year, nationality…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="hscroll" style={{ gap: 6 }}>
        {SORTS.map((s) => (
          <button key={s.key} className={`sortpill ${sort === s.key ? 'on' : ''}`} onClick={() => setSort(s.key)}>{s.label}</button>
        ))}
      </div>

      <div className="screen-scroll feed-list">
        {list === null && <div className="hint"><TetrisLoader label="Counting everyone up…" /></div>}
        {list?.length === 0 && <div className="meta">No users match.</div>}
        {list?.map((u, i) => (
          <Link key={u.id} to={`/admin/users/${u.id}`} className="card-outline" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="tnum" style={{ width: 26, fontSize: 13, fontWeight: 700, color: 'var(--meta)' }}>#{i + 1}</span>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: AVATARS[i % AVATARS.length], color: '#0A0A0A', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{initials(u.name)}</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="row" style={{ gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{reporterLabel(u.name, u.reporter_kind)}</span>
                  {u.reporter_kind === 'parent' ? <span className="pill-tag parent-tag">PARENT</span> : u.reporter_kind === 'other' ? <span className="pill-tag other-tag">OTHER</span> : null}
                  {u.role === 'admin' && <span className="pill-tag" style={{ background: 'var(--christncr)', color: 'var(--on-christncr)' }}>Admin</span>}
                </span>
                <span style={{ fontSize: 12, color: 'var(--meta)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.email} · {cohortLabel(u.course, u.grad_year)}{u.nationality ? ` · ${u.nationality}` : ''}
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Stat n={u.complaints} label="raised" />
              <Stat n={u.open_complaints} label="open" />
              <Stat n={u.resolved_complaints} label="resolved" />
              <Stat n={u.upvotes_received} label="upvotes got" />
              <Stat n={u.votes_cast} label="votes cast" />
              <Stat n={u.flags_cast} label="flags cast" />
              <Stat n={u.escalations} label="escalations" warn />
            </div>
            {(u.private_complaints > 0 || u.hidden_complaints > 0 || u.flags_received > 0) && (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {u.private_complaints > 0 && <span className="pill-tag" style={{ background: 'var(--purple)', color: '#fff' }}>{u.private_complaints} private</span>}
                {u.hidden_complaints > 0 && <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A' }}>{u.hidden_complaints} hidden</span>}
                {u.flags_received > 0 && <span className="pill-tag" style={{ background: 'var(--card)', color: 'var(--meta)' }}>{u.flags_received} flags received</span>}
              </div>
            )}
          </Link>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}
