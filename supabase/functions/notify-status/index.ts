// Christ NCR Forum · notify-status
// Triggered by a database webhook on INSERT into public.updates.
// Emails the complainant and everyone who upvoted, via Resend.
// Auth: the webhook sends the service-role key as a Bearer token; browsers
// never call this function.

import { createClient } from 'npm:@supabase/supabase-js@2'

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${serviceKey}`) return new Response('Unauthorized', { status: 401 })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM') ?? 'Christ NCR Forum <onboarding@resend.dev>'
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
  if (!resendKey) {
    console.warn('RESEND_API_KEY not set; skipping email')
    return new Response('skipped', { status: 200 })
  }

  const payload = await req.json().catch(() => null)
  const record = payload?.record
  if (payload?.type !== 'INSERT' || !['updates', 'escalations'].includes(payload?.table) || !record?.complaint_id) {
    return new Response('ignored', { status: 200 })
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  // ---- Escalation: the author said nothing has been promised. Email the
  // admins plus the people in charge (ESCALATION_EMAILS, comma-separated).
  if (payload.table === 'escalations') {
    const { data: c } = await db
      .from('complaints')
      .select('id, title, body, category, status, created_at, escalations, profiles!complaints_author_id_fkey(email, name, course, grad_year)')
      .eq('id', record.complaint_id)
      .single()
    if (!c) return new Response('not found', { status: 200 })
    const who = c.profiles as unknown as { email: string; name: string; course: string | null; grad_year: number | null } | null
    const { data: admins } = await db.from('admins').select('email')
    const extra = (Deno.env.get('ESCALATION_EMAILS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const to = [...new Set([...(admins ?? []).map((a) => a.email), ...extra])]
    if (to.length === 0) return new Response('no recipients', { status: 200 })

    const days = Math.max(1, Math.round((Date.now() - new Date(c.created_at).getTime()) / 864e5))
    const link = appUrl ? `${appUrl}/admin` : ''
    const html = `
      <div style="font-family:'Nunito','Segoe UI',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0A0A0A">
        <div style="font-size:28px;font-weight:800;letter-spacing:-0.04em">CU <span style="color:#FFD60A">FORUM</span></div>
        <div style="display:inline-block;background:#FF5FA2;color:#0A0A0A;font-weight:700;font-size:12px;padding:5px 9px;border-radius:6px;margin:12px 0">Escalation${c.escalations > 1 ? ` #${c.escalations}` : ''}</div>
        <p style="font-size:15px;color:#555">A complaint has been open for <b>${days} day${days === 1 ? '' : 's'}</b>. The student says it is not solved and nobody has promised a fix.</p>
        <div style="background:#F2F2F2;border-radius:18px;padding:16px;margin:16px 0">
          <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8A8A8A">${escapeHtml(String(c.category).replace('_', ' '))} · ${escapeHtml(STATUS_LABEL[c.status] ?? c.status)}</div>
          <div style="font-size:18px;font-weight:700;margin:6px 0 10px">${escapeHtml(c.title)}</div>
          <p style="font-size:14px;line-height:1.5;margin:0;white-space:pre-wrap">${escapeHtml(c.body)}</p>
        </div>
        <p style="font-size:14px">Posted by <b>${escapeHtml(who?.name ?? 'Unknown')}</b> (${escapeHtml(who?.email ?? '')}${who?.course ? `, ${escapeHtml(who.course)} '${String(who.grad_year ?? '').slice(-2)}` : ''}).</p>
        ${link ? `<a href="${link}" style="display:inline-block;background:#FFD60A;color:#0A0A0A;font-weight:700;padding:12px 18px;border-radius:12px;text-decoration:none">Open the admin panel</a>` : ''}
        <p style="font-size:12px;color:#8A8A8A;margin-top:24px">You receive escalations because you are listed as an admin or as a person in charge for Christ NCR Forum.</p>
      </div>`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: `[Christ NCR Forum] Escalation: ${c.title}`, html }),
    })
    if (!res.ok) console.error('Resend error', res.status, await res.text())
    return new Response(JSON.stringify({ escalated: to.length }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const { data: complaint, error: cErr } = await db
    .from('complaints')
    .select('id, title, status, is_private, author_id, profiles!complaints_author_id_fkey(email, name)')
    .eq('id', record.complaint_id)
    .single()
  if (cErr || !complaint) {
    console.error('complaint lookup failed', cErr)
    return new Response('not found', { status: 200 })
  }

  const author = complaint.profiles as unknown as { email: string; name: string } | null

  // Upvoters (never for private complaints: those have no upvoters anyway,
  // but be explicit).
  let voterEmails: string[] = []
  if (!complaint.is_private) {
    const { data: votes } = await db
      .from('votes')
      .select('profiles!votes_user_id_fkey(email)')
      .eq('complaint_id', complaint.id)
    voterEmails = (votes ?? [])
      .map((v) => (v.profiles as unknown as { email: string } | null)?.email)
      .filter((e): e is string => Boolean(e))
  }

  const status = STATUS_LABEL[record.status] ?? record.status
  const note: string | null = record.note ?? null
  const link = appUrl ? `${appUrl}/c/${complaint.id}` : ''
  const subject = `[Christ NCR Forum] ${status}: ${complaint.title}`

  const html = (greeting: string) => `
    <div style="font-family:'Nunito','Segoe UI',system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0A0A0A">
      <div style="font-size:28px;font-weight:700;letter-spacing:-0.04em">CU <span style="color:#FFD60A">FORUM</span></div>
      <p style="font-size:15px;color:#555">${greeting}</p>
      <div style="background:#F2F2F2;border-radius:18px;padding:16px;margin:16px 0">
        <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8A8A8A">Status</div>
        <div style="font-size:20px;font-weight:700;margin:4px 0 10px">${escapeHtml(status)}</div>
        <div style="font-size:16px;font-weight:600">${escapeHtml(complaint.title)}</div>
        ${note ? `<p style="font-size:14px;line-height:1.5;margin:12px 0 0;white-space:pre-wrap">${escapeHtml(note)}</p>` : ''}
      </div>
      ${link ? `<a href="${link}" style="display:inline-block;background:#FFD60A;color:#0A0A0A;font-weight:700;padding:12px 18px;border-radius:12px;text-decoration:none">Open on Christ NCR Forum</a>` : ''}
      <p style="font-size:12px;color:#8A8A8A;margin-top:24px">You get this because you posted or upvoted this complaint. Posts are anonymous to students; admins can see who posted.</p>
    </div>`

  const messages: Array<{ from: string; to: string[]; subject: string; html: string }> = []
  if (author?.email) {
    messages.push({ from, to: [author.email], subject, html: html('Your complaint has a new update.') })
  }
  for (const email of new Set(voterEmails)) {
    if (email === author?.email) continue
    messages.push({ from, to: [email], subject, html: html('A complaint you upvoted has a new update.') })
  }
  if (messages.length === 0) return new Response('no recipients', { status: 200 })

  // Resend batch endpoint takes up to 100 messages per call.
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    })
    if (!res.ok) console.error('Resend error', res.status, await res.text())
  }

  return new Response(JSON.stringify({ sent: messages.length }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
})
