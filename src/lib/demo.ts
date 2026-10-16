/**
 * Demo mode (VITE_DEMO=1): the whole app runs against in-memory sample data
 * from the design file, with no Supabase. Lets you preview every screen
 * before the backend is set up. Never enabled in a real deployment.
 */
import type { AdminComment, PublicComment, ReportedComment } from './types'
import type { AdminComplaint, AiReview, Category, OwnComplaint, Profile, PublicComplaint, PublicUpdate, Status, UserDetail, UserStats, AdminEntry } from './types'
import { DAY, HOUR, MIN } from './time'
import { ATTENTION_THRESHOLD, type FeedTab } from './labels'

export const DEMO = import.meta.env.VITE_DEMO === '1'

const t0 = Date.now()
const iso = (ms: number) => new Date(ms).toISOString()

export const DEMO_PROFILE: Profile = {
  id: 'u-me', email: 'vyomahuja30122009@gmail.com', name: 'Vyom Ahuja', course: null, grad_year: null, nationality: 'Indian', role: 'admin', reporter_kind: 'student', onboarded_at: iso(t0 - 30 * DAY),
}

type Row = OwnComplaint & { profile: Pick<Profile, 'name' | 'email' | 'course' | 'grad_year'> }
const mk = (p: Partial<Row> & Pick<Row, 'id' | 'category' | 'title' | 'body' | 'profile'>): Row => ({
  author_id: 'u-other', status: 'open', is_private: false, hidden: false, upvotes: 0, flags: 0,
  created_at: iso(t0 - DAY), updated_at: iso(t0), acknowledged_at: null, resolved_at: null, reopened_at: null, checkin_due_at: null, escalations: 0, ...p,
})

const ME = { name: 'Vyom Ahuja', email: 'vyomahuja30122009@gmail.com', course: null, grad_year: null }
const rows: Row[] = [
  mk({ id: 'c1', author_id: 'u-me', profile: ME, category: 'housing', title: 'No hot water in the girls hostel for 4 days',
    body: 'Floors 2–4 have been cold since Friday. The warden said "this week" on Monday. We have 9am classes and it is freezing in the mornings.',
    status: 'in_progress', upvotes: 142, created_at: iso(t0 - (3 * DAY + 4 * HOUR + 12 * MIN + 8000)), acknowledged_at: iso(t0 - 2 * DAY), checkin_due_at: iso(t0 - HOUR) }),
  mk({ id: 'c2', profile: { name: 'Ananya Sharma', email: 'ananya.sharma@bbafth.christuniversity.in', course: 'BBAFTH', grad_year: null }, category: 'cia',
    title: 'CIA 2 Google Form closed before the deadline',
    body: 'The form said 11:59pm but stopped accepting responses at 10pm. Half the section could not submit and the coordinator has not replied.',
    upvotes: 211, created_at: iso(t0 - (5 * DAY + 2 * HOUR + 40 * MIN)), escalated_at: iso(t0 - DAY), escalations: 1 }),
  mk({ id: 'c3', profile: { name: 'Rohan Gupta', email: 'rohan.gupta@bcomh.christuniversity.in', course: 'BCOMH', grad_year: null }, category: 'tech_portal',
    title: 'Campus Wi-Fi drops in every classroom after 11am',
    body: 'Happens on all floors of the main block. We cannot open the attendance link or class material during lectures.',
    status: 'acknowledged', upvotes: 98, created_at: iso(t0 - (DAY + 7 * HOUR + 3 * MIN)), acknowledged_at: iso(t0 - 5 * HOUR) }),
  mk({ id: 'c4', author_id: 'u-me', profile: ME, category: 'classes', title: 'Two CIA tests scheduled in the same slot',
    body: 'Business Statistics and Financial Accounting CIA 3 are both Thursday 10:00 for BBA FTH section B.',
    upvotes: 0, created_at: iso(t0 - (9 * HOUR + 22 * MIN)) }),
  mk({ id: 'c5', author_id: 'u-me', profile: ME, category: 'canteen', title: 'Canteen charging more than the printed menu',
    body: 'Veg thali is ₹70 on the board but they charge ₹90. Same for cold coffee. Nobody gives a bill.',
    status: 'resolved', upvotes: 64, created_at: iso(t0 - 4 * DAY), acknowledged_at: iso(t0 - 3 * DAY), resolved_at: iso(t0 - (2 * DAY - 6 * HOUR - 14 * MIN)) }),
  mk({ id: 'c6', profile: { name: 'Arjun Mehra', email: 'arjun.mehra@bbafth.christuniversity.in', course: 'BBAFTH', grad_year: null }, category: 'faculty',
    title: 'Prof in Section B is useless, skip his class', body: 'Honestly just skip, nothing is taught and the slides are from 2015.', flags: 14, hidden: true, upvotes: 3 }),
  mk({ id: 'c7', profile: { name: 'Ishita Verma', email: 'ishita.verma@bcomh.christuniversity.in', course: 'BCOMH', grad_year: null }, category: 'other',
    title: 'Selling Accounts notes, DM me', body: 'Full semester notes, 40 pages, message me for the price.', flags: 9, hidden: true }),
  mk({ id: 'c8', profile: { name: 'Priya Nair', email: 'priya.nair@bbafth.christuniversity.in', course: 'BBAFTH', grad_year: null }, category: 'safety',
    title: 'Someone keeps following me to the hostel at night', body: 'Three times this week after the library closes. Same person each time, keeps distance but it is scary.',
    is_private: true, created_at: iso(t0 - (3 * HOUR + 5 * MIN)) }),
  mk({ id: 'c9', profile: { name: 'Kabir Singh', email: 'kabir.singh@bcomh.christuniversity.in', course: 'BCOMH', grad_year: null }, category: 'safety',
    title: 'Inappropriate comments from a TA in group chat', body: 'Screenshots available. It has happened in the class WhatsApp group twice now.',
    is_private: true, created_at: iso(t0 - (DAY + 2 * HOUR)) }),
  mk({ id: 'c10', profile: { name: 'Meera Joshi', email: 'meera.joshi@bbafth.christuniversity.in', course: 'BBAFTH', grad_year: null }, category: 'housing',
    title: 'Low water pressure in the boys hostel', body: 'Barely a trickle on floor 3 after 7am. Has been like this for two weeks.', upvotes: 23, created_at: iso(t0 - 2 * DAY) }),
]
const votes = new Set<string>(['c1'])
const flagsMine = new Set<string>()
const flagReasons: Record<string, string[]> = { c6: ['Names a specific person', 'Abusive or hateful'], c7: ['Spam or advertising'] }
const updates: PublicUpdate[] = [
  { id: 'u1', complaint_id: 'c1', status: 'acknowledged', note: null, created_at: iso(t0 - 2 * DAY) },
  { id: 'u2', complaint_id: 'c1', status: 'in_progress', note: "The geyser needs a replacement part, which arrives Wednesday. Until then, the ground-floor bathrooms have hot water 6–10am. We'll update this post when it's fixed.", created_at: iso(t0 - 20 * HOUR) },
  { id: 'u3', complaint_id: 'c5', status: 'resolved', note: 'Prices are back to the printed menu and bills are now given for every order.', created_at: iso(t0 - (2 * DAY - 6 * HOUR - 14 * MIN)) },
]

const admins: AdminEntry[] = [
  { email: ME.email, added_at: iso(t0 - 30 * DAY), name: ME.name, course: ME.course, grad_year: ME.grad_year, signed_in: true, is_owner: true, can_delete: true },
  { email: 'shlok.ram@bbafth.christuniversity.in', added_at: iso(t0 - 20 * DAY), name: 'Shlok Ram', course: 'BBAFTH', grad_year: null, signed_in: true, is_owner: false, can_delete: true },
]

const emit = () => window.dispatchEvent(new CustomEvent('christncr-demo-change'))
export const onDemoChange = (cb: () => void) => {
  window.addEventListener('christncr-demo-change', cb)
  return () => window.removeEventListener('christncr-demo-change', cb)
}

const toPublic = (r: Row): PublicComplaint => ({
  id: r.id, category: r.category, title: r.title, body: r.body, status: r.status, upvotes: r.upvotes,
  created_at: r.created_at, updated_at: r.updated_at, acknowledged_at: r.acknowledged_at, resolved_at: r.resolved_at, reopened_at: r.reopened_at,
  course: null, grad_year: null,
  has_voted: votes.has(r.id), has_flagged: flagsMine.has(r.id), is_mine: r.author_id === 'u-me',
  attention: r.upvotes > ATTENTION_THRESHOLD,
  comments: comments.filter((c) => c.complaint_id === r.id && !c.hidden).length,
})
const toAdmin = (r: Row): AdminComplaint => ({ ...r, profiles: r.profile, attention: r.upvotes > ATTENTION_THRESHOLD })
const pub = () => rows.filter((r) => !r.hidden && !r.is_private)
const find = (id: string) => { const r = rows.find((x) => x.id === id); if (!r) throw new Error('Complaint not found'); return r }
// Fake network latency. Set localStorage['christncr.demo.slow'] = '3000' to watch the loaders.
const wait = () => new Promise((r) => { let ms = 120; try { ms = Number(localStorage.getItem('christncr.demo.slow')) || 120 } catch { /* private mode */ } setTimeout(r, ms) })

type DemoComment = { id: string; complaint_id: string; body: string; created_at: string; hidden: boolean; reports: number; reasons: string[]; mine: boolean; reported: boolean; author: Pick<Profile, 'name' | 'email' | 'course' | 'grad_year'> }
const comments: DemoComment[] = [
  { id: 'cm1', complaint_id: 'c1', body: 'Same on floor 3. The warden told us Friday too.', created_at: iso(t0 - 5 * HOUR), hidden: false, reports: 0, reasons: [], mine: false, reported: false, author: { name: 'Meera Joshi', email: 'meera.joshi@bbafth.christuniversity.in', course: 'BBAFTH', grad_year: null } },
  { id: 'cm2', complaint_id: 'c1', body: 'Update: still cold this morning.', created_at: iso(t0 - 2 * HOUR), hidden: false, reports: 0, reasons: [], mine: true, reported: false, author: ME },
  { id: 'cm3', complaint_id: 'c1', body: 'Spam spam buy now', created_at: iso(t0 - HOUR), hidden: true, reports: 3, reasons: ['Spam or advertising', 'Spam or advertising', 'Off-topic'], mine: false, reported: false, author: { name: 'Arjun Mehra', email: 'arjun.mehra@bbafth.christuniversity.in', course: 'BBAFTH', grad_year: null } },
]
const findComment = (id: string) => { const c = comments.find((x) => x.id === id); if (!c) throw new Error('Comment not found'); return c }
const isOp = (c: DemoComment) => rows.find((r) => r.id === c.complaint_id)?.profile.email === c.author.email

const contactInbox: { id: string; name: string; contact: string | null; message: string; user_id: string | null; created_at: string }[] = [
  { id: 'm1', name: 'Anita Rao', contact: 'anita.rao@example.com', message: 'My college Google account says it is not allowed. I am in BCom Hons, second year.', user_id: null, created_at: iso(t0 - 2 * 3600_000) },
]

export const demo = {
  async fetchComments(id: string): Promise<PublicComment[]> {
    await wait()
    return comments.filter((c) => c.complaint_id === id && !c.hidden).map((c) => ({
      id: c.id, complaint_id: c.complaint_id, body: c.body, created_at: c.created_at, course: null, grad_year: null,
      by_op: isOp(c), is_mine: c.mine, has_reported: c.reported,
    }))
  },
  async postComment(id: string, body: string) {
    await wait()
    if (body.trim().length < 2 || body.trim().length > 500) throw new Error('Comments need 2 to 500 characters.')
    comments.push({ id: 'cm' + Date.now(), complaint_id: id, body: body.trim(), created_at: iso(Date.now()), hidden: false, reports: 0, reasons: [], mine: true, reported: false, author: ME })
    emit()
  },
  async deleteComment(id: string) { const i = comments.findIndex((c) => c.id === id); if (i >= 0) comments.splice(i, 1); emit() },
  async reportComment(id: string) { const c = findComment(id); c.reported = true; c.reports++; c.reasons.push('Reported'); if (c.reports >= 3) c.hidden = true; emit() },
  async fetchAdminComments(id: string): Promise<AdminComment[]> {
    await wait()
    return comments.filter((c) => c.complaint_id === id).map((c) => ({
      id: c.id, complaint_id: c.complaint_id, body: c.body, created_at: c.created_at, hidden: c.hidden, reports: c.reports, by_op: isOp(c),
      author_id: c.mine ? 'u-me' : 'u-' + c.author.email, name: c.author.name, email: c.author.email, course: c.author.course, grad_year: c.author.grad_year,
      reporter_kind: 'student' as const,
    }))
  },
  async fetchReportedComments(): Promise<ReportedComment[]> {
    await wait()
    return comments.filter((c) => c.reports > 0).map((c) => ({
      id: c.id, complaint_id: c.complaint_id, complaint_title: rows.find((r) => r.id === c.complaint_id)?.title ?? '', body: c.body, created_at: c.created_at,
      hidden: c.hidden, reports: c.reports, reasons: c.reasons, name: c.author.name, email: c.author.email, course: c.author.course, grad_year: c.author.grad_year,
      reporter_kind: 'student' as const,
    }))
  },
  async restoreComment(id: string) { const c = findComment(id); c.hidden = false; c.reports = 0; c.reasons = []; emit() },
  async fetchFeed(category: FeedTab, sort: 'top' | 'new' | 'oldest_unresolved') {
    await wait()
    let list = pub().filter((r) => r.status !== 'resolved').filter((r) => category === 'all' || (category === 'attention' ? r.upvotes > ATTENTION_THRESHOLD : r.category === category))
    if (sort === 'top') list = [...list].sort((a, b) => b.upvotes - a.upvotes)
    else if (sort === 'new') list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
    else list = list.filter((r) => r.status !== 'resolved' && r.status !== 'rejected').sort((a, b) => a.created_at.localeCompare(b.created_at))
    return list.map(toPublic)
  },
  async fetchResolved(category: FeedTab) {
    await wait()
    return pub()
      .filter((r) => r.status === 'resolved' && (category === 'all' || (category === 'attention' ? r.upvotes > ATTENTION_THRESHOLD : r.category === category)))
      .sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''))
      .map(toPublic)
  },
  async fetchPublicComplaint(id: string) { await wait(); const r = pub().find((x) => x.id === id); return r ? toPublic(r) : null },
  async fetchPublicByIds(ids: string[]) { return ids.map((id) => pub().find((x) => x.id === id)).filter(Boolean).map((r) => toPublic(r!)) },
  async fetchUpdates(id: string) { return updates.filter((u) => u.complaint_id === id) },
  async toggleVote(id: string, hasVoted: boolean) {
    const r = find(id)
    if (hasVoted) { votes.delete(id); r.upvotes = Math.max(0, r.upvotes - 1) } else { votes.add(id); r.upvotes++ }
    emit()
  },
  async flag(id: string, reason: string) {
    const r = find(id); flagsMine.add(id); r.flags++; (flagReasons[id] ??= []).push(reason); if (r.flags >= 3) r.hidden = true; emit()
  },
  async unflag(id: string) { const r = find(id); flagsMine.delete(id); r.flags = Math.max(0, r.flags - 1); emit() },
  async aiReview(input: { body: string; category?: Category }): Promise<AiReview> {
    await new Promise((r) => setTimeout(r, 900))
    const b = input.body.toLowerCase()
    const similar = /hot water|shower|block c/.test(b) ? ['c1', 'c10'] : /visa|flight/.test(b) ? ['c2'] : /portal|quiz|log/.test(b) ? ['c3'] : []
    const name = /\b(prof\.?|professor|dr\.?|mr\.?|ms\.?)\s+[a-z]+/i.test(input.body)
    const abusive = /\b(idiot|useless|stupid|hate)\b/i.test(input.body)
    const first = input.body.replace(/\s+/g, ' ').trim()
    const cut = (s: string) => (s.length <= 80 ? s : s.slice(0, 80).replace(/\s+\S*$/, '')).trim()
    const clean = cut((first.charAt(0).toUpperCase() + first.slice(1)).split(/[.!?]/)[0]!.replace(/[?!]+$/, ''))
    return { category: input.category ?? 'other', clean_title: clean, contains_person_name: name, abusive, similar_ids: similar }
  },
  async createComplaint(input: { category: Category; title: string; body: string; is_private: boolean; grace_days: number }) {
    const id = `c${Date.now()}`
    rows.unshift(mk({ id, author_id: 'u-me', profile: ME, category: input.category, title: input.title, body: input.body, is_private: input.is_private, created_at: iso(Date.now()), grace_days: input.grace_days, checkin_due_at: iso(Date.now() + input.grace_days * DAY) }))
    emit(); return id
  },
  async fetchDueCheckins() {
    return rows.filter((r) => r.author_id === 'u-me' && r.checkin_due_at && r.checkin_due_at <= iso(Date.now()) && !['resolved', 'rejected'].includes(r.status)).map(({ profile: _p, ...r }) => r as OwnComplaint)
  },
  async answerCheckin(id: string, solved: boolean, promised?: number) {
    const r = find(id)
    if (solved) { r.status = 'resolved'; r.resolved_at = iso(Date.now()); r.checkin_due_at = null }
    else if (promised) { r.promised_days = promised; r.checkin_due_at = iso(Date.now() + promised * DAY) }
    else { r.escalated_at = iso(Date.now()); r.escalations = (r.escalations ?? 0) + 1; r.checkin_due_at = iso(Date.now() + 3 * DAY) }
    emit()
  },
  async fetchAdminUsers(): Promise<UserStats[]> {
    await wait()
    const byEmail = new Map<string, Row[]>()
    for (const r of rows) byEmail.set(r.profile.email, [...(byEmail.get(r.profile.email) ?? []), r])
    return [...byEmail.entries()].map(([email, cs]) => {
      const p = cs[0]!.profile
      const id = cs[0]!.author_id === 'u-me' ? 'u-me' : 'u-' + email.split('@')[0]
      return {
        id, email, name: p.name, course: p.course, grad_year: p.grad_year, nationality: id === 'u-me' ? DEMO_PROFILE.nationality ?? null : null, role: id === 'u-me' ? 'admin' : 'student', created_at: iso(t0 - 30 * DAY),
        complaints: cs.length, open_complaints: cs.filter((c) => !['resolved', 'rejected'].includes(c.status)).length,
        resolved_complaints: cs.filter((c) => c.status === 'resolved').length, private_complaints: cs.filter((c) => c.is_private).length,
        hidden_complaints: cs.filter((c) => c.hidden).length, upvotes_received: cs.reduce((s, c) => s + c.upvotes, 0),
        votes_cast: id === 'u-me' ? votes.size : 0, flags_cast: id === 'u-me' ? flagsMine.size : 0,
        flags_received: cs.reduce((s, c) => s + c.flags, 0), escalations: cs.reduce((s, c) => s + (c.escalations ?? 0), 0),
        last_complaint_at: cs.map((c) => c.created_at).sort().at(-1) ?? null,
      } as UserStats
    }).sort((a, b) => b.complaints - a.complaints || b.upvotes_received - a.upvotes_received)
  },
  async fetchAdminUser(id: string): Promise<UserDetail | null> {
    const users = await this.fetchAdminUsers()
    const u = users.find((x) => x.id === id)
    if (!u) return null
    const cs = rows.filter((r) => r.profile.email === u.email)
    const tt = (cid: string) => rows.find((r) => r.id === cid)?.title ?? null
    return {
      profile: u,
      complaints: cs.map(({ profile: _p, ...r }) => r as OwnComplaint),
      votes: id === 'u-me' ? [...votes].map((cid) => ({ complaint_id: cid, created_at: iso(t0 - 2 * DAY), title: tt(cid) })) : [],
      flags: id === 'u-me' ? [...flagsMine].map((cid) => ({ complaint_id: cid, created_at: iso(t0 - HOUR), reason: (flagReasons[cid] ?? []).at(-1) ?? '', title: tt(cid) })) : [],
      escalations: cs.filter((c) => c.escalated_at).map((c) => ({ complaint_id: c.id, created_at: c.escalated_at!, title: c.title })),
      identity_views: cs.slice(0, 2).map((c) => ({ viewed_at: iso(t0 - 10 * MIN), complaint_id: c.id, admin_name: ME.name, admin_email: ME.email })),
    }
  },
  async setNationality(v: string) { DEMO_PROFILE.nationality = v.trim() || null },
  async completeOnboarding(nationality: string, kind: 'student' | 'parent' | 'other') { await wait(); DEMO_PROFILE.nationality = nationality; DEMO_PROFILE.reporter_kind = kind; DEMO_PROFILE.onboarded_at = new Date().toISOString() },
  async fetchAdmins() { await wait(); return [...admins] },
  async grantAdmin(email: string) {
    const e = email.trim().toLowerCase()
    if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e)) throw new Error('That does not look like an email address')
    if (!admins.some((a) => a.email === e)) {
      const p = rows.find((r) => r.profile.email === e)?.profile
      admins.push({ email: e, added_at: iso(Date.now()), name: p?.name ?? null, course: p?.course ?? null, grad_year: p?.grad_year ?? null, signed_in: Boolean(p), is_owner: false, can_delete: false })
    }
  },
  async setAdminDelete(email: string, allow: boolean) {
    await wait()
    const a = admins.find((x) => x.email === email.trim().toLowerCase() && !x.is_owner)
    if (!a) throw new Error('No such admin')
    a.can_delete = allow
  },
  async revokeAdmin(email: string) {
    if (admins.find((a) => a.email === email)?.is_owner) throw new Error('The owner cannot be removed')
    const i = admins.findIndex((a) => a.email === email); if (i >= 0) admins.splice(i, 1)
  },
  async fetchMine() { await wait(); return rows.filter((r) => r.author_id === 'u-me').map(({ profile: _p, ...r }) => r as OwnComplaint) },
  async deleteComplaint(id: string) { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); emit() },
  async editComplaint(id: string, title: string, body: string) {
    const r = find(id); if (r.upvotes > 0) throw new Error('This complaint has upvotes and can no longer be edited'); r.title = title; r.body = body; emit()
  },
  async reopenComplaint(id: string) { const r = find(id); r.status = 'open'; r.reopened_at = iso(Date.now()); r.resolved_at = null; emit() },
  async fetchVoters(id: string) {
    await wait()
    const people = rows.filter((r) => r.id !== id).slice(0, 3).map((r) => r.profile)
    const n = Math.min(rows.find((r) => r.id === id)?.upvotes ?? 0, people.length)
    return people.slice(0, n).map((p, i) => ({ user_id: 'u-' + i, created_at: iso(t0 - (i + 1) * 3600_000), profiles: { ...p, reporter_kind: i === 1 ? 'parent' as const : 'student' as const } }))
  },
  async sendContactMessage(input: { name: string; contact: string | null; message: string }) {
    await wait()
    contactInbox.unshift({ id: 'm' + Date.now(), user_id: null, created_at: new Date().toISOString(), ...input })
  },
  async fetchContactMessages() { await wait(); return [...contactInbox] },
  async deleteContactMessage(id: string) { await wait(); const i = contactInbox.findIndex((m) => m.id === id); if (i >= 0) contactInbox.splice(i, 1) },
  async fetchAdminAll() { await wait(); return rows.filter((r) => !r.is_private && !r.hidden).map(toAdmin) },
  async fetchAdminFlagged() { await wait(); return rows.filter((r) => !r.is_private && r.flags > 0).map((r) => ({ ...toAdmin(r), flag_reasons: flagReasons[r.id] ?? [] })) },
  async fetchAdminPrivate() { await wait(); return rows.filter((r) => r.is_private).map(toAdmin) },
  async adminSetStatus(id: string, status: Status, note?: string) {
    const r = find(id); r.status = status
    if (status === 'acknowledged' && !r.acknowledged_at) r.acknowledged_at = iso(Date.now())
    if (status === 'resolved') r.resolved_at = iso(Date.now()); else if (status !== 'rejected') r.resolved_at = null
    updates.push({ id: `u${Date.now()}`, complaint_id: id, status, note: note?.trim() || null, created_at: iso(Date.now()) }); emit()
  },
  async adminReply(id: string, note: string) { const r = find(id); updates.push({ id: `u${Date.now()}`, complaint_id: id, status: r.status, note, created_at: iso(Date.now()) }); emit() },
  async adminRestore(id: string) { const r = find(id); r.hidden = false; r.flags = 0; flagReasons[id] = []; flagsMine.delete(id); emit() },
}

