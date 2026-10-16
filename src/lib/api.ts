import { supabase } from './supabase'
import { DEMO, demo } from './demo'
import type { AdminComplaint, AdminEntry, AiReview, Category, OwnComplaint, PublicComplaint, PublicUpdate, Status, UserDetail, UserStats, ReporterKind, Voter, ContactMessage, PublicComment, AdminComment, ReportedComment } from './types'
import type { FeedTab } from './labels'

export type SortKey = 'top' | 'new' | 'oldest_unresolved'

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message)
}

// ---------------- feed (students) ----------------

export async function fetchFeed(category: FeedTab, sort: SortKey): Promise<PublicComplaint[]> {
  if (DEMO) return demo.fetchFeed(category, sort)
  let q = supabase.from('public_complaints').select('*').neq('status', 'resolved')
  if (category === 'attention') q = q.eq('attention', true)
  else if (category !== 'all') q = q.eq('category', category)
  if (sort === 'top') q = q.order('upvotes', { ascending: false }).order('created_at', { ascending: false })
  else if (sort === 'new') q = q.order('created_at', { ascending: false })
  else q = q.not('status', 'in', '(resolved,rejected)').order('created_at', { ascending: true })
  const { data, error } = await q.limit(200)
  fail(error)
  return (data ?? []) as PublicComplaint[]
}

/** Resolved posts for the "Problems which are resolved" section, latest fix first. */
export async function fetchResolved(category: FeedTab): Promise<PublicComplaint[]> {
  if (DEMO) return demo.fetchResolved(category)
  let q = supabase.from('public_complaints').select('*').eq('status', 'resolved')
  if (category === 'attention') q = q.eq('attention', true)
  else if (category !== 'all') q = q.eq('category', category)
  const { data, error } = await q.order('resolved_at', { ascending: false, nullsFirst: false }).limit(200)
  fail(error)
  return (data ?? []) as PublicComplaint[]
}

export async function fetchPublicComplaint(id: string): Promise<PublicComplaint | null> {
  if (DEMO) return demo.fetchPublicComplaint(id)
  const { data, error } = await supabase.from('public_complaints').select('*').eq('id', id).maybeSingle()
  fail(error)
  return (data as PublicComplaint | null) ?? null
}

export async function fetchPublicByIds(ids: string[]): Promise<PublicComplaint[]> {
  if (DEMO) return demo.fetchPublicByIds(ids)
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('public_complaints').select('*').in('id', ids)
  fail(error)
  const order = new Map(ids.map((id, i) => [id, i]))
  return ((data ?? []) as PublicComplaint[]).sort((a, b) => order.get(a.id)! - order.get(b.id)!)
}

export async function fetchUpdates(complaintId: string): Promise<PublicUpdate[]> {
  if (DEMO) return demo.fetchUpdates(complaintId)
  const { data, error } = await supabase
    .from('public_updates').select('*').eq('complaint_id', complaintId).order('created_at', { ascending: true })
  fail(error)
  return (data ?? []) as PublicUpdate[]
}

export async function toggleVote(complaintId: string, userId: string, hasVoted: boolean) {
  if (DEMO) return demo.toggleVote(complaintId, hasVoted)
  if (hasVoted) {
    const { error } = await supabase.from('votes').delete().match({ complaint_id: complaintId, user_id: userId })
    fail(error)
  } else {
    const { error } = await supabase.from('votes').insert({ complaint_id: complaintId, user_id: userId })
    if (error && error.code !== '23505') fail(error) // 23505: already voted (double tap)
  }
}

export async function flagComplaint(complaintId: string, userId: string, reason: string) {
  if (DEMO) return demo.flag(complaintId, reason)
  const { error } = await supabase.from('flags').insert({ complaint_id: complaintId, user_id: userId, reason })
  if (error && error.code !== '23505') fail(error)
}

export async function unflagComplaint(complaintId: string, userId: string) {
  if (DEMO) return demo.unflag(complaintId)
  const { error } = await supabase.from('flags').delete().match({ complaint_id: complaintId, user_id: userId })
  fail(error)
}

// ---------------- comments ----------------

export async function fetchComments(complaintId: string): Promise<PublicComment[]> {
  if (DEMO) return demo.fetchComments(complaintId)
  const { data, error } = await supabase.from('public_comments').select('*').eq('complaint_id', complaintId).order('created_at', { ascending: true })
  fail(error)
  return (data ?? []) as PublicComment[]
}

export async function postComment(complaintId: string, userId: string, body: string): Promise<void> {
  if (DEMO) return demo.postComment(complaintId, body)
  const { error } = await supabase.from('comments').insert({ complaint_id: complaintId, author_id: userId, body })
  if (error) {
    if (/check constraint/i.test(error.message)) throw new Error('Comments need 2 to 500 characters.')
    if (/row-level security/i.test(error.message)) throw new Error('This post is not open for comments.')
    throw new Error(error.message)
  }
}

/** Your own comment, or any comment for the super admin. */
export async function deleteComment(id: string): Promise<void> {
  if (DEMO) return demo.deleteComment(id)
  const { data, error } = await supabase.from('comments').delete().eq('id', id).select('id')
  fail(error)
  if (!data || data.length === 0) throw new Error('You can only delete your own comments.')
}

export async function reportComment(id: string, userId: string, reason: string): Promise<void> {
  if (DEMO) return demo.reportComment(id)
  const { error } = await supabase.from('comment_reports').insert({ comment_id: id, user_id: userId, reason })
  if (error && error.code !== '23505') fail(error)
}

/** Admin: comments on one post with real names (each look is logged). */
export async function fetchAdminComments(complaintId: string): Promise<AdminComment[]> {
  if (DEMO) return demo.fetchAdminComments(complaintId)
  const { data, error } = await supabase.rpc('admin_comments', { p_complaint: complaintId })
  fail(error)
  return (data ?? []) as AdminComment[]
}

export async function fetchReportedComments(): Promise<ReportedComment[]> {
  if (DEMO) return demo.fetchReportedComments()
  const { data, error } = await supabase.rpc('admin_reported_comments')
  fail(error)
  return (data ?? []) as ReportedComment[]
}

export async function restoreComment(id: string): Promise<void> {
  if (DEMO) return demo.restoreComment(id)
  const { error } = await supabase.rpc('admin_restore_comment', { p_id: id })
  fail(error)
}

// ---------------- compose ----------------

export async function aiReview(input: { body: string; category?: Category; title?: string }): Promise<AiReview> {
  if (DEMO) return demo.aiReview(input)
  const { data, error } = await supabase.functions.invoke<AiReview & { error?: string }>('ai-review', { body: input })
  if (error) {
    // Pull the function's own message out of the response when there is one.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const j = await ctx.json().catch(() => null)
      if (j?.error) throw new Error(j.error)
    }
    throw new Error(error.message)
  }
  if (!data || data.error) throw new Error(data?.error ?? 'AI review failed')
  return data
}

export async function createComplaint(input: {
  author_id: string; category: Category; title: string; body: string; is_private: boolean; grace_days: number
}): Promise<string> {
  if (DEMO) return demo.createComplaint(input)
  const { data, error } = await supabase.from('complaints').insert(input).select('id').single()
  fail(error)
  return data!.id as string
}

// ---------------- mine ----------------

export async function fetchMine(userId: string): Promise<OwnComplaint[]> {
  if (DEMO) return demo.fetchMine()
  const { data, error } = await supabase
    .from('complaints').select('*').eq('author_id', userId).order('created_at', { ascending: false })
  fail(error)
  return (data ?? []) as OwnComplaint[]
}

export async function deleteComplaint(id: string) {
  if (DEMO) return demo.deleteComplaint(id)
  const { error } = await supabase.from('complaints').delete().eq('id', id)
  fail(error)
}

export async function editComplaint(id: string, title: string, body: string) {
  if (DEMO) return demo.editComplaint(id, title, body)
  const { error } = await supabase.rpc('edit_complaint', { p_id: id, p_title: title, p_body: body })
  fail(error)
}

export async function reopenComplaint(id: string) {
  if (DEMO) return demo.reopenComplaint(id)
  const { error } = await supabase.rpc('reopen_complaint', { p_id: id })
  fail(error)
}

// ---------------- admin ----------------

const ADMIN_SELECT = '*, profiles!complaints_author_id_fkey(name, email, course, grad_year, reporter_kind)'

/** Admin only: who upvoted a complaint, oldest first. RLS lets only admins read others' votes. */
export async function fetchVoters(complaintId: string): Promise<Voter[]> {
  if (DEMO) return demo.fetchVoters(complaintId)
  const { data, error } = await supabase
    .from('votes')
    .select('user_id, created_at, profiles!votes_user_id_fkey(name, email, course, grad_year, reporter_kind)')
    .eq('complaint_id', complaintId)
    .order('created_at', { ascending: true })
  fail(error)
  return (data ?? []) as unknown as Voter[]
}

// ---------------- contact us ----------------

/** Anyone, signed in or not: a one-way note to the admins. */
export async function sendContactMessage(input: { name: string; contact: string | null; message: string }): Promise<void> {
  if (DEMO) return demo.sendContactMessage(input)
  const { error } = await supabase.from('contact_messages').insert(input)
  if (error) {
    if (/check constraint/i.test(error.message)) throw new Error('Please add your name and a message of at most 200 words.')
    throw new Error(error.message)
  }
}

export async function fetchContactMessages(): Promise<ContactMessage[]> {
  if (DEMO) return demo.fetchContactMessages()
  const { data, error } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(500)
  fail(error)
  return (data ?? []) as ContactMessage[]
}

export async function deleteContactMessage(id: string): Promise<void> {
  if (DEMO) return demo.deleteContactMessage(id)
  const { error } = await supabase.from('contact_messages').delete().eq('id', id)
  fail(error)
}

export async function fetchAdminAll(): Promise<AdminComplaint[]> {
  if (DEMO) return demo.fetchAdminAll()
  const { data, error } = await supabase
    .from('complaints').select(ADMIN_SELECT)
    .eq('is_private', false).eq('hidden', false)
    .order('created_at', { ascending: false })
  fail(error)
  return (data ?? []) as unknown as AdminComplaint[]
}

export async function fetchAdminFlagged(): Promise<(AdminComplaint & { flag_reasons: string[] })[]> {
  if (DEMO) return demo.fetchAdminFlagged()
  const { data, error } = await supabase
    .from('complaints').select(`${ADMIN_SELECT}, flags_rows:flags(reason)`)
    .eq('is_private', false).gt('flags', 0)
    .order('flags', { ascending: false })
  fail(error)
  return ((data ?? []) as unknown as (AdminComplaint & { flags_rows: { reason: string }[] })[]).map((r) => ({
    ...r, flag_reasons: (r.flags_rows ?? []).map((f) => f.reason),
  }))
}

export async function fetchAdminPrivate(): Promise<AdminComplaint[]> {
  if (DEMO) return demo.fetchAdminPrivate()
  const { data, error } = await supabase
    .from('complaints').select(ADMIN_SELECT).eq('is_private', true)
    .order('created_at', { ascending: false })
  fail(error)
  return (data ?? []) as unknown as AdminComplaint[]
}

export async function logAdminView(ids: string[]) {
  if (DEMO) return
  if (ids.length === 0) return
  const { error } = await supabase.rpc('log_admin_view', { p_ids: ids })
  if (error) console.warn('admin view log failed', error.message)
}

export async function adminSetStatus(id: string, status: Status, note?: string) {
  if (DEMO) return demo.adminSetStatus(id, status, note)
  const { error } = await supabase.rpc('admin_set_status', { p_id: id, p_status: status, p_note: note ?? null })
  fail(error)
}

export async function adminReply(id: string, note: string) {
  if (DEMO) return demo.adminReply(id, note)
  const { error } = await supabase.rpc('admin_reply', { p_id: id, p_note: note })
  fail(error)
}

export async function adminRestore(id: string) {
  if (DEMO) return demo.adminRestore(id)
  const { error } = await supabase.rpc('admin_restore', { p_id: id })
  fail(error)
}

export async function adminDelete(id: string) {
  if (DEMO) return demo.deleteComplaint(id)
  const { error } = await supabase.from('complaints').delete().eq('id', id)
  fail(error)
}

// ---------------- check-ins ----------------

/** Own complaints whose follow-up question is due now. */
export async function fetchDueCheckins(userId: string): Promise<OwnComplaint[]> {
  if (DEMO) return demo.fetchDueCheckins()
  const { data, error } = await supabase
    .from('complaints').select('*')
    .eq('author_id', userId)
    .in('status', ['open', 'acknowledged', 'in_progress'])
    .lte('checkin_due_at', new Date().toISOString())
    .order('checkin_due_at', { ascending: true })
  fail(error)
  return (data ?? []) as OwnComplaint[]
}

export async function answerCheckin(id: string, solved: boolean, promisedDays?: number) {
  if (DEMO) return demo.answerCheckin(id, solved, promisedDays)
  const { error } = await supabase.rpc('answer_checkin', { p_id: id, p_solved: solved, p_promised_days: promisedDays ?? null })
  fail(error)
}

// ---------------- admin: users ----------------

export async function fetchAdminUsers(): Promise<UserStats[]> {
  if (DEMO) return demo.fetchAdminUsers()
  const { data, error } = await supabase.rpc('admin_user_stats')
  fail(error)
  return ((data ?? []) as UserStats[]).map((u) => ({
    ...u,
    complaints: Number(u.complaints), open_complaints: Number(u.open_complaints), resolved_complaints: Number(u.resolved_complaints),
    private_complaints: Number(u.private_complaints), hidden_complaints: Number(u.hidden_complaints),
    upvotes_received: Number(u.upvotes_received), votes_cast: Number(u.votes_cast), flags_cast: Number(u.flags_cast),
    flags_received: Number(u.flags_received), escalations: Number(u.escalations),
  }))
}

export async function fetchAdminUser(id: string): Promise<UserDetail | null> {
  if (DEMO) return demo.fetchAdminUser(id)
  const { data: profile, error: pErr } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  fail(pErr)
  if (!profile) return null
  const [c, v, f, e] = await Promise.all([
    supabase.from('complaints').select('*').eq('author_id', id).order('created_at', { ascending: false }),
    supabase.from('votes').select('complaint_id, created_at, complaints(title)').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('flags').select('complaint_id, created_at, reason, complaints(title)').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('escalations').select('complaint_id, created_at, complaints(title)').eq('author_id', id).order('created_at', { ascending: false }),
  ])
  fail(c.error); fail(v.error); fail(f.error); fail(e.error)
  const complaints = (c.data ?? []) as OwnComplaint[]
  const ids = complaints.map((x) => x.id)
  let views: UserDetail['identity_views'] = []
  if (ids.length) {
    const { data } = await supabase
      .from('admin_views').select('viewed_at, complaint_id, profiles!admin_views_admin_id_fkey(name, email)')
      .in('complaint_id', ids).order('viewed_at', { ascending: false }).limit(100)
    views = (data ?? []).map((r) => {
      const a = r.profiles as unknown as { name: string; email: string } | null
      return { viewed_at: r.viewed_at, complaint_id: r.complaint_id, admin_name: a?.name ?? null, admin_email: a?.email ?? null }
    })
  }
  const title = (r: { complaints: unknown }) => (r.complaints as { title: string } | null)?.title ?? null
  return {
    profile: profile as UserDetail['profile'],
    complaints,
    votes: (v.data ?? []).map((r) => ({ complaint_id: r.complaint_id, created_at: r.created_at, title: title(r) })),
    flags: (f.data ?? []).map((r) => ({ complaint_id: r.complaint_id, created_at: r.created_at, reason: r.reason, title: title(r) })),
    escalations: (e.data ?? []).map((r) => ({ complaint_id: r.complaint_id, created_at: r.created_at, title: title(r) })),
    identity_views: views,
  }
}

// ---------------- admin: access ----------------

export async function fetchAdmins(): Promise<AdminEntry[]> {
  if (DEMO) return demo.fetchAdmins()
  const { data, error } = await supabase.rpc('admin_list')
  fail(error)
  return (data ?? []) as AdminEntry[]
}

export async function grantAdmin(email: string) {
  if (DEMO) return demo.grantAdmin(email)
  const { error } = await supabase.rpc('admin_grant', { p_email: email })
  fail(error)
}

/** Owner only: let an admin delete complaints, or take that away. */
export async function setAdminDelete(email: string, allow: boolean) {
  if (DEMO) return demo.setAdminDelete(email, allow)
  const { error } = await supabase.rpc('admin_set_delete', { p_email: email, p_allow: allow })
  fail(error)
}

export async function revokeAdmin(email: string) {
  if (DEMO) return demo.revokeAdmin(email)
  const { error } = await supabase.rpc('admin_revoke', { p_email: email })
  fail(error)
}

// ---------------- profile ----------------

/** First-visit screen, and later edits from Settings: nationality + who is complaining. */
export async function completeOnboarding(nationality: string, kind: ReporterKind, name?: string): Promise<void> {
  if (DEMO) return demo.completeOnboarding(nationality, kind)
  const { error } = await supabase.rpc('complete_onboarding', { p_nationality: nationality, p_reporter_kind: kind, p_name: name ?? null })
  fail(error)
}

/** The signed-in student sets their own nationality (nothing else is editable). */
export async function setNationality(value: string) {
  if (DEMO) return demo.setNationality(value)
  const { error } = await supabase.rpc('set_nationality', { p_nationality: value })
  fail(error)
}
