import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useNow } from '../hooks/useNow'
import { useToast } from '../hooks/useToast'
import { fetchAdminUser, logAdminView } from '../lib/api'
import { STATUS, categoryLabel, cohortLabel, initials, reporterLabel } from '../lib/labels'
import type { UserDetail } from '../lib/types'
import { shortWhen, timerLabel } from '../lib/time'
import { timerColor } from '../components/ComplaintCard'
import { StatusPill } from '../components/Pills'
import { BottomNav } from '../components/BottomNav'
import { ThemeToggle } from '../components/ThemeToggle'
import { TetrisLoader } from '../components/TetrisLoader'
import { BackIcon } from '../components/Icons'
import { Stat } from './AdminUsers'

const Section = ({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div className="row" style={{ gap: 8 }}>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</div>
      {count !== undefined && <span className="pill-tag" style={{ background: 'var(--card)', color: 'var(--meta)' }}>{count}</span>}
    </div>
    {children}
  </div>
)

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="row" style={{ justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
    <span style={{ color: 'var(--meta)', fontWeight: 600 }}>{k}</span>
    <span style={{ textAlign: 'right', fontWeight: 600, wordBreak: 'break-all' }}>{v}</span>
  </div>
)

export default function AdminUser() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const now = useNow()
  const [d, setD] = useState<UserDetail | null | undefined>(undefined)

  useEffect(() => {
    fetchAdminUser(id).then((res) => {
      setD(res)
      // Seeing this page means seeing who wrote every one of their complaints.
      if (res) logAdminView(res.complaints.map((c) => c.id))
    }).catch((e) => toast((e as Error).message, 'err'))
  }, [id, toast])

  if (d === undefined) return <div className="screen" style={{ justifyContent: 'center' }}><TetrisLoader label="Pulling the record…" /></div>
  if (d === null) {
    return (
      <div className="screen" style={{ padding: 16, gap: 16 }}>
        <button className="btn btn-icon" aria-label="Back" onClick={() => nav(-1)}><BackIcon /></button>
        <div className="h2">User not found</div>
      </div>
    )
  }

  const p = d.profile
  const cs = d.complaints
  const open = cs.filter((c) => !['resolved', 'rejected'].includes(c.status))
  const resolved = cs.filter((c) => c.status === 'resolved')
  const upvotes = cs.reduce((s, c) => s + c.upvotes, 0)
  const avgResolveMs = resolved.length
    ? resolved.reduce((s, c) => s + (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()), 0) / resolved.length
    : null
  const days = (ms: number) => `${(ms / 864e5).toFixed(1)}d`

  return (
    <div className="screen wide">
      <div className="row page-head" style={{ padding: '18px 16px 12px', gap: 10 }}>
        <Link to="/admin/users" className="btn btn-icon" aria-label="Back to users"><BackIcon /></Link>
        <div className="h2">User record</div>
        <div style={{ marginLeft: 'auto' }}><ThemeToggle /></div>
      </div>

      <div className="screen-scroll" style={{ gap: 20 }}>
        <div className="card" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 12 }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--yellow)', color: '#0A0A0A', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800, flexShrink: 0 }}>{initials(p.name)}</span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="row" style={{ gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>{reporterLabel(p.name, p.reporter_kind)}</span>
                {p.reporter_kind === 'parent' ? <span className="pill-tag parent-tag">PARENT</span> : p.reporter_kind === 'other' ? <span className="pill-tag other-tag">OTHER</span> : null}
                {p.role === 'admin' && <span className="pill-tag" style={{ background: 'var(--christncr)', color: 'var(--on-christncr)' }}>Admin</span>}
              </span>
              <span style={{ fontSize: 13, color: 'var(--meta)', wordBreak: 'break-all' }}>{p.email}</span>
            </span>
          </div>
          <div>
            <Row k="Course" v={p.course ?? '—'} />
            <Row k="Graduation year" v={p.grad_year ?? '—'} />
            <Row k="Cohort" v={cohortLabel(p.course, p.grad_year)} />
            <Row k="Nationality" v={p.nationality ?? '—'} />
            <Row k="Complaining as" v={p.reporter_kind === 'parent' ? `Parent of ${p.name}` : p.reporter_kind === 'other' ? `Other (via ${p.name})` : p.reporter_kind === 'student' ? 'The student' : 'Not chosen yet'} />
            <Row k="Role" v={p.role} />
            <Row k="User id" v={<code style={{ fontSize: 12 }}>{p.id}</code>} />
            <Row k="First sign-in" v={shortWhen(p.created_at)} />
            <Row k="Email" v={<a href={`mailto:${p.email}`} style={{ textDecoration: 'underline' }}>{p.email}</a>} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Stat n={cs.length} label="raised" />
            <Stat n={open.length} label="open" />
            <Stat n={resolved.length} label="resolved" />
            <Stat n={cs.filter((c) => c.status === 'rejected').length} label="rejected" />
            <Stat n={upvotes} label="upvotes got" />
            <Stat n={d.votes.length} label="votes cast" />
            <Stat n={d.flags.length} label="flags cast" />
            <Stat n={cs.reduce((s, c) => s + c.flags, 0)} label="flags received" />
            <Stat n={d.escalations.length} label="escalations" warn />
          </div>
          {avgResolveMs !== null && <div className="meta" style={{ fontSize: 13 }}>Average time to resolution: <b style={{ color: 'var(--fg)' }}>{days(avgResolveMs)}</b></div>}
        </div>

        <Section title="Complaints raised" count={cs.length}>
          {cs.length === 0 && <div className="meta">None yet.</div>}
          <div className="feed-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cs.map((c) => (
              <div key={c.id} className="card-outline" style={{ borderColor: c.escalated_at ? 'var(--pink)' : c.is_private ? 'var(--purple)' : 'var(--line)' }}>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <StatusPill s={c.status} />
                  <span style={{ fontSize: 12, color: 'var(--meta)' }}>{categoryLabel(c.category)} · {c.upvotes} upvotes · {c.flags} flags</span>
                  {c.is_private && <span className="pill-tag" style={{ background: 'var(--purple)', color: '#fff' }}>Private</span>}
                  {c.hidden && <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A' }}>Hidden</span>}
                  {c.attention && <span className="pill-tag" style={{ background: 'var(--yellow)', color: '#0A0A0A' }}>Attention</span>}
                  {c.escalated_at && <span className="pill-tag" style={{ background: 'var(--pink)', color: '#0A0A0A' }}>Escalated{(c.escalations ?? 0) > 1 ? ` ×${c.escalations}` : ''}</span>}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: 'var(--meta)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                <div className="tnum" style={{ fontSize: 12, fontWeight: 700, color: timerColor(c) }}>{timerLabel(c, now)}</div>
                <div style={{ fontSize: 12, color: 'var(--meta)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px 12px' }}>
                  <span>Posted {shortWhen(c.created_at)}</span>
                  {c.acknowledged_at && <span>Acknowledged {shortWhen(c.acknowledged_at)}</span>}
                  {c.resolved_at && <span>Resolved {shortWhen(c.resolved_at)}</span>}
                  {c.reopened_at && <span>Reopened {shortWhen(c.reopened_at)}</span>}
                  {c.checkin_due_at && <span>Next check-in {shortWhen(c.checkin_due_at)}</span>}
                  {c.checkin_answered_at && <span>Last check-in answered {shortWhen(c.checkin_answered_at)}</span>}
                  {c.promised_days && <span>Fix promised within {c.promised_days}d</span>}
                  {c.escalated_at && <span>Escalated {shortWhen(c.escalated_at)}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Upvotes cast" count={d.votes.length}>
          {d.votes.length === 0 && <div className="meta">None.</div>}
          {d.votes.map((v) => (
            <div key={v.complaint_id} className="row" style={{ justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{v.title ?? <i style={{ color: 'var(--meta)' }}>deleted complaint</i>}</span>
              <span className="tnum" style={{ fontSize: 12, color: 'var(--meta)', whiteSpace: 'nowrap' }}>{shortWhen(v.created_at)}</span>
            </div>
          ))}
        </Section>

        <Section title="Flags cast" count={d.flags.length}>
          {d.flags.length === 0 && <div className="meta">None.</div>}
          {d.flags.map((f) => (
            <div key={f.complaint_id} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontWeight: 600 }}>{f.title ?? <i style={{ color: 'var(--meta)' }}>deleted complaint</i>}</span>
                <span className="tnum" style={{ fontSize: 12, color: 'var(--meta)', whiteSpace: 'nowrap' }}>{shortWhen(f.created_at)}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--pink)', fontWeight: 600 }}>Reason: {f.reason}</span>
            </div>
          ))}
        </Section>

        <Section title="Escalations" count={d.escalations.length}>
          {d.escalations.length === 0 && <div className="meta">None.</div>}
          {d.escalations.map((e, i) => (
            <div key={i} className="row" style={{ justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{e.title ?? <i style={{ color: 'var(--meta)' }}>deleted complaint</i>}</span>
              <span className="tnum" style={{ fontSize: 12, color: 'var(--meta)', whiteSpace: 'nowrap' }}>{shortWhen(e.created_at)}</span>
            </div>
          ))}
        </Section>

        <Section title="Identity views (audit)" count={d.identity_views.length}>
          <div className="meta" style={{ fontSize: 13 }}>Every time an admin saw this student's name next to a complaint.</div>
          {d.identity_views.length === 0 && <div className="meta">None recorded.</div>}
          {d.identity_views.slice(0, 50).map((v, i) => (
            <div key={i} className="row" style={{ justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span><b>{v.admin_name ?? v.admin_email ?? 'admin'}</b> <span style={{ color: 'var(--meta)' }}>viewed “{cs.find((c) => c.id === v.complaint_id)?.title ?? v.complaint_id}”</span></span>
              <span className="tnum" style={{ fontSize: 12, color: 'var(--meta)', whiteSpace: 'nowrap' }}>{shortWhen(v.viewed_at)}</span>
            </div>
          ))}
        </Section>

        <div className="meta" style={{ fontSize: 12 }}>Status key: {Object.values(STATUS).map((s) => s.label).join(' · ')}</div>
      </div>

      <BottomNav />
    </div>
  )
}
