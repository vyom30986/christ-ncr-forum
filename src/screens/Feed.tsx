import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNow } from '../hooks/useNow'
import { useToast } from '../hooks/useToast'
import { useFeedRealtime } from '../hooks/useFeedRealtime'
import { fetchFeed, fetchResolved, flagComplaint, toggleVote, unflagComplaint, type SortKey } from '../lib/api'
import { FEED_TABS, type FeedTab } from '../lib/labels'
import type { PublicComplaint } from '../lib/types'
import { ComplaintCard } from '../components/ComplaintCard'
import { Blocks, EMPTY_T } from '../components/Blocks'
import { BottomNav } from '../components/BottomNav'
import { FlagSheet } from '../components/FlagSheet'
import { PlusIcon } from '../components/Icons'
import { ThemeToggle } from '../components/ThemeToggle'
import { Tour } from '../components/Tour'
import { InstallBanner } from '../components/InstallPrompt'
import { SettingsMenu } from '../components/SettingsMenu'
import { TetrisLoader } from '../components/TetrisLoader'
import { GuestStrip, SignInSheet } from '../components/SignInNeeded'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'top', label: 'Top' }, { key: 'new', label: 'New' }, { key: 'oldest_unresolved', label: 'Oldest unresolved' },
]

export default function Feed() {
  const { session } = useAuth()
  const toast = useToast()
  const now = useNow()
  const [tab, setTab] = useState<FeedTab>('all')
  const [sort, setSort] = useState<SortKey>('top')
  const [items, setItems] = useState<PublicComplaint[] | null>(null)
  const [resolved, setResolved] = useState<PublicComplaint[]>([])
  const [flagging, setFlagging] = useState<PublicComplaint | null>(null)
  const userId = session?.user.id ?? ''
  const guest = !session
  const nav = useNavigate()
  const [needSignIn, setNeedSignIn] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [open, done] = await Promise.all([fetchFeed(tab, sort), fetchResolved(tab)])
      setItems(open)
      setResolved(done)
    } catch (e) { toast((e as Error).message, 'err') }
  }, [tab, sort, toast])

  useEffect(() => { load() }, [load])
  useFeedRealtime(load)

  const patch = (id: string, fn: (c: PublicComplaint) => PublicComplaint) => {
    setItems((prev) => prev?.map((c) => (c.id === id ? fn(c) : c)) ?? prev)
    setResolved((prev) => prev.map((c) => (c.id === id ? fn(c) : c)))
  }

  const onVote = async (c: PublicComplaint) => {
    if (guest) { setNeedSignIn('upvote'); return }
    patch(c.id, (x) => ({ ...x, has_voted: !x.has_voted, upvotes: x.upvotes + (x.has_voted ? -1 : 1) }))
    try { await toggleVote(c.id, userId, c.has_voted) } catch (e) { toast((e as Error).message, 'err'); load() }
  }

  const onFlag = async (c: PublicComplaint) => {
    if (guest) { setNeedSignIn('flag a post'); return }
    if (c.has_flagged) {
      patch(c.id, (x) => ({ ...x, has_flagged: false }))
      try { await unflagComplaint(c.id, userId) } catch (e) { toast((e as Error).message, 'err'); load() }
    } else {
      setFlagging(c)
    }
  }

  const tabLabel = FEED_TABS.find((t) => t.key === tab)?.label ?? 'this tab'

  return (
    <div className="screen wide">
      <div className="row page-head" style={{ padding: '18px 16px 12px', gap: 12, flexShrink: 0 }}>
        {!guest && <SettingsMenu />}
        <div className="brand" style={{ fontSize: 30 }} data-tour="brand">CU <span className="slash">FORUM</span></div>
        <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
          {guest && <button className="btn btn-primary sm guest-signin" onClick={() => nav('/login', { state: { from: '/' } })}>Sign in</button>}
          <ThemeToggle />
        </div>
      </div>

      <div className="hscroll" role="tablist" data-tour="tabs">
        {FEED_TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`chip ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="row sortrow" style={{ gap: 6, padding: '0 16px 12px', flexShrink: 0 }} data-tour="sort">
        <span style={{ fontSize: 13, color: 'var(--meta)', marginRight: 4 }}>Sort</span>
        {SORTS.map((s) => (
          <button key={s.key} className={`sortpill ${sort === s.key ? 'on' : ''}`} onClick={() => setSort(s.key)}>{s.label}</button>
        ))}
      </div>

      <div className="screen-scroll feed-list">
        {guest && <GuestStrip />}
        <InstallBanner />
        {items === null && <div className="hint"><TetrisLoader label="Loading the board…" /></div>}
        {items?.length === 0 && (
          <div className="empty">
            <Blocks rows={EMPTY_T} />
            <div className="t">{resolved.length ? `Nothing open in ${tabLabel}` : `Nothing in ${tabLabel} yet`}</div>
            <div className="s">{tab === 'attention' ? 'Posts with more than 50 upvotes land here automatically.' : "Line's clear. If something's off, be the first to say it."}</div>
          </div>
        )}
        {items?.map((c, idx) => <ComplaintCard key={c.id} c={c} now={now} onVote={onVote} onFlag={onFlag} tour={idx === 0} />)}
        {items !== null && resolved.length > 0 && (
          <div className="feed-section">
            <span className="feed-section-title">Problems which are resolved</span>
            <span className="feed-section-count tnum">{resolved.length}</span>
          </div>
        )}
        {items !== null && resolved.map((c) => <ComplaintCard key={c.id} c={c} now={now} onVote={onVote} onFlag={onFlag} />)}
      </div>

      {guest
        ? <button className="fab" aria-label="New complaint" onClick={() => setNeedSignIn('post a complaint')}><PlusIcon /></button>
        : <Link to="/new" className="fab" aria-label="New complaint" data-tour="fab"><PlusIcon /></Link>}
      {!guest && <Tour />}
      <SignInSheet open={needSignIn !== null} onClose={() => setNeedSignIn(null)} action={needSignIn ?? ''} />
      <BottomNav />

      <FlagSheet open={Boolean(flagging)} onClose={() => setFlagging(null)} onSubmit={async (reason) => {
        const c = flagging!
        patch(c.id, (x) => ({ ...x, has_flagged: true }))
        try { await flagComplaint(c.id, userId, reason); toast('Flagged. Admins will take a look.') }
        catch (e) { toast((e as Error).message, 'err'); load() }
      }} />
    </div>
  )
}
