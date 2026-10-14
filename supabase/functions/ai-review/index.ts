// Christ NCR Forum · ai-review
// One Gemini call per submission. Classifies, cleans the title, checks for
// named people and abuse, and finds near-duplicates among the latest 50
// open public complaints. The Gemini key lives only here, never on the client.
//
// Request  (POST, Authorization: Bearer <user jwt>)
//   { "body": string, "category"?: string, "title"?: string }
// Response
//   { category, clean_title, contains_person_name, abusive, similar_ids }

import { createClient } from 'npm:@supabase/supabase-js@2'

const CATEGORIES = [
  'admissions', 'classes', 'faculty', 'student_life', 'housing',
  'tech_portal', 'safety', 'canteen', 'sports', 'events', 'cia', 'other',
] as const
type Category = (typeof CATEGORIES)[number]

// Only the app itself (production, Cloudflare preview builds, local dev) may
// call this from a browser. ALLOWED_ORIGINS (comma-separated) overrides.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://christ-ncr-forum.pages.dev').split(',').map((s) => s.trim()).filter(Boolean)
const originAllowed = (o: string) =>
  ALLOWED_ORIGINS.includes(o) ||
  /^https:\/\/[a-z0-9-]+\.christ-ncr-forum\.pages\.dev$/.test(o) ||
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o)
const corsFor = (req: Request) => {
  const o = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': originAllowed(o) ? o : ALLOWED_ORIGINS[0]!,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

// Each user may run at most this many reviews per hour (shared AI quota).
const AI_CALLS_PER_HOUR = 30

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
// When the main model is overloaded (503 'high demand'), try others, one shot each.
// GEMINI_FALLBACK_MODELS (comma-separated) wins; otherwise we ask the API once per
// isolate which flash models this key can actually call, so nothing is guessed.
let fallbackCache: string[] | null = null
async function fallbackModels(key: string): Promise<string[]> {
  const env = Deno.env.get('GEMINI_FALLBACK_MODELS')
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean)
  if (fallbackCache) return fallbackCache
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}`, { signal: AbortSignal.timeout(4_000) })
    if (!res.ok) return []
    const data = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
    const names = (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /flash/.test(n) && !/(preview|exp|tts|image|live|audio|thinking|8b|embed)/.test(n) && n !== GEMINI_MODEL)
    // Lite variants first (least likely to be overloaded), then newest by version number.
    const ver = (n: string) => parseFloat((n.match(/(\d+(?:\.\d+)?)/) ?? ['0', '0'])[1]) || 0
    names.sort((a, b) => (Number(/lite/.test(b)) - Number(/lite/.test(a))) || (ver(b) - ver(a)))
    fallbackCache = names.slice(0, 2)
    console.log('Gemini fallbacks resolved', fallbackCache)
  } catch (e) {
    console.warn('Could not list Gemini models', String(e))
    return []
  }
  return fallbackCache
}

// Second provider when every Gemini model is down: any OpenAI-compatible chat
// API. Groq is the default (free tier, no card, fast). Set FALLBACK_LLM_KEY to
// turn it on; FALLBACK_LLM_URL / FALLBACK_LLM_MODEL override the defaults.
const FALLBACK_LLM_KEY = Deno.env.get('FALLBACK_LLM_KEY') ?? Deno.env.get('GROQ_API_KEY') ?? ''
const FALLBACK_LLM_URL = Deno.env.get('FALLBACK_LLM_URL') ?? 'https://api.groq.com/openai/v1/chat/completions'
const FALLBACK_LLM_MODEL = Deno.env.get('FALLBACK_LLM_MODEL') ?? 'llama-3.3-70b-versatile'
// Whole review must finish inside this, or the student gets the plain preview.
const TOTAL_BUDGET_MS = 14_000

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING', enum: [...CATEGORIES] },
    clean_title: { type: 'STRING' },
    contains_person_name: { type: 'BOOLEAN' },
    abusive: { type: 'BOOLEAN' },
    similar_ids: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['category', 'clean_title', 'contains_person_name', 'abusive', 'similar_ids'],
}

Deno.serve(async (req) => {
  // CORS headers are computed per request and added to whatever handle() returns.
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let res: Response
  try { res = await handle(req) } catch (e) { console.error('ai-review crashed', String(e)); res = json({ error: 'AI review failed. Please try again or post without AI.' }, 500) }
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
  return res
})

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) return json({ error: 'GEMINI_API_KEY is not set' }, 500)

  // Who is asking? (verify_jwt already rejected anonymous calls; this also
  // confirms the user exists and lets us refuse non-@christuniversity.in tokens.)
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !/@([a-z0-9-]+\.)*christuniversity\.in$/i.test(user?.email ?? '')) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let input: { body?: string; category?: string; title?: string }
  try {
    input = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const body = (input.body ?? '').trim()
  if (body.length < 10) return json({ error: 'Complaint is too short' }, 400)
  if (body.length > 1000) return json({ error: 'Complaint is too long' }, 400)
  const hint = CATEGORIES.includes(input.category as Category) ? (input.category as Category) : null

  // Latest 50 open public complaints, read with the service role (only
  // id/title/body/category leave this function, and only as similar_ids).
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Rate limit (table public.ai_calls, migration 0017). If the table is
  // missing the check is skipped rather than blocking every student.
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const { count: used, error: countErr } = await admin
    .from('ai_calls').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', hourAgo)
  if (countErr) console.warn('ai_calls count failed', countErr.message)
  else if ((used ?? 0) >= AI_CALLS_PER_HOUR) {
    return json({ error: 'You have used the AI review a lot in the last hour. Please wait a bit and try again.' }, 429)
  }
  await admin.from('ai_calls').insert({ user_id: user.id })
  await admin.from('ai_calls').delete().eq('user_id', user.id).lt('created_at', new Date(Date.now() - 86_400_000).toISOString())

  const { data: recent, error: recentErr } = await admin
    .from('complaints')
    .select('id, category, title, body')
    .eq('status', 'open')
    .eq('hidden', false)
    .eq('is_private', false)
    .order('created_at', { ascending: false })
    .limit(50)
  if (recentErr) return json({ error: recentErr.message }, 500)

  const candidates = (recent ?? []).map((c) => ({
    id: c.id, category: c.category, title: c.title, body: String(c.body).slice(0, 300),
  }))

  const prompt = `You moderate an anonymous complaint board for students of CHRIST (Deemed to be University), Delhi NCR.

Categories (pick exactly one): ${CATEGORIES.join(', ')}.
- safety = harassment, stalking, threats, physical safety. Anything in safety is private.
- cia = Continuous Internal Assessment: CIA marks, submissions and the Google Forms used for them.
- canteen = food, prices, hygiene; sports = grounds, equipment, teams; events = fests, clubs, college events.
${hint ? `- The student suggested the category "${hint}"; keep it unless it is clearly wrong.\n` : ''}
Tasks:
1. category: best category for the complaint.
2. clean_title: a neutral, specific headline of at most 80 characters (no names, no profanity, sentence case, no trailing period).${input.title ? ` The student proposed: "${String(input.title).slice(0, 120)}".` : ''}
3. contains_person_name: true if the complaint names or clearly identifies a specific real person (a student, professor, staff member, e.g. "Prof. Sharma", "Rahul from BBA"). Role-only references like "the visa desk" or "a TA" are fine.
4. abusive: true if the text is hate speech, a threat, harassment, sexual content, or primarily an insult rather than a complaint.
5. similar_ids: ids of existing complaints (from the list below) that describe the SAME underlying issue. Return at most 3, best match first, or an empty list.

Existing open complaints (JSON):
${JSON.stringify(candidates)}

New complaint:
"""
${body}
"""`

  const urlFor = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
  const collapsed = body.replace(/\s+/g, ' ').trim()
  const firstSentence = collapsed.split(/[.!?]/)[0]!.trim()
  const cutWord = (s: string) => (s.length <= 80 ? s : s.slice(0, 80).replace(/\s+\S*$/, '')).trim()
  const fallbackTitle = cutWord(firstSentence.length >= 3 ? firstSentence : collapsed)
  // Gemini is a helper, not a gate: if it is down (503/429/5xx) after a few
  // retries, let the student post with their own title and category.
  const degraded = () => json({
    category: hint ?? 'other', clean_title: fallbackTitle, contains_person_name: false, abusive: false, similar_ids: [], degraded: true,
  })
  const started = Date.now()
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - started)
  const GEMINI_MODELS = [GEMINI_MODEL, ...(await fallbackModels(geminiKey))].filter((m, i, a) => a.indexOf(m) === i)
  let gemRes: Response | null = null
  let usedModel = GEMINI_MODEL
  for (let attempt = 0; attempt < GEMINI_MODELS.length; attempt++) {
    usedModel = GEMINI_MODELS[attempt]!
    if (remaining() < 1500) { console.warn('Gemini: out of time budget before', usedModel); break }
    try {
      gemRes = await fetch(urlFor(usedModel), {
    method: 'POST',
    signal: AbortSignal.timeout(Math.min(7_000, remaining())), // never hang the student's Post button
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
      safetySettings: [
        // We want the model to *label* abusive text, not refuse to look at it.
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  })
    } catch (e) {
      console.error('Gemini fetch failed', String(e))
      gemRes = null
    }
    if (gemRes && gemRes.ok) break
    // A fallback model that does not exist for this key (404) is skipped, not fatal.
    const retryable = !gemRes || [429, 500, 502, 503, 504].includes(gemRes.status) || (attempt > 0 && gemRes.status === 404)
    if (!retryable) break
    if (attempt < GEMINI_MODELS.length - 1) console.warn(`Gemini ${usedModel} unavailable (${gemRes?.status ?? 'timeout'}), trying ${GEMINI_MODELS[attempt + 1]}`)
  }

  if (!gemRes || !gemRes.ok) {
    const text = gemRes ? await gemRes.text() : 'no response'
    console.error('Gemini error', gemRes?.status, text)
    // Configuration problems (bad key, bad request shape, retired model) must
    // be visible, not silently degrade moderation for everyone.
    if (gemRes && [400, 401, 403, 404].includes(gemRes.status) && usedModel === GEMINI_MODEL) {
      return json({ error: `AI review is misconfigured (Gemini ${gemRes.status}). Check GEMINI_API_KEY and GEMINI_MODEL (currently "${GEMINI_MODEL}").` }, 502)
    }
    const alt = await secondProvider(prompt, remaining())
    if (alt) return finish(alt, candidates, hint, fallbackTitle)
    return degraded()
  }

  const gem = await gemRes.json()
  const text: string | undefined = gem?.candidates?.[0]?.content?.parts?.[0]?.text
  let parsed: Parsed = {}
  try {
    parsed = JSON.parse(text ?? '{}')
  } catch {
    console.error('Gemini returned non-JSON', text)
  }
  return finish(parsed, candidates, hint, fallbackTitle)
}

type Parsed = { category?: string; clean_title?: string; contains_person_name?: boolean; abusive?: boolean; similar_ids?: string[] }

function finish(parsed: Parsed, candidates: { id: string }[], hint: Category | null, fallbackTitle: string) {
  const validIds = new Set(candidates.map((c) => c.id))
  const category: Category = CATEGORIES.includes(parsed.category as Category)
    ? (parsed.category as Category)
    : hint ?? 'other'
  const cleanTitle = (parsed.clean_title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || fallbackTitle
  return json({
    category,
    clean_title: cleanTitle,
    contains_person_name: Boolean(parsed.contains_person_name),
    abusive: Boolean(parsed.abusive),
    similar_ids: (Array.isArray(parsed.similar_ids) ? parsed.similar_ids : []).filter((id) => validIds.has(id)).slice(0, 3),
  })
}

/** Groq / OpenRouter / any OpenAI-compatible chat endpoint, JSON mode. */
async function secondProvider(prompt: string, budgetMs: number): Promise<Parsed | null> {
  if (!FALLBACK_LLM_KEY) { console.warn('No FALLBACK_LLM_KEY set; skipping second provider'); return null }
  if (budgetMs < 1500) { console.warn('Second provider: out of time budget'); return null }
  try {
    const res = await fetch(FALLBACK_LLM_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(Math.min(8_000, budgetMs)),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FALLBACK_LLM_KEY}` },
      body: JSON.stringify({
        model: FALLBACK_LLM_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Reply with a single JSON object with keys category (string), clean_title (string), contains_person_name (boolean), abusive (boolean), similar_ids (array of strings). No prose.' },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) { console.error('Second provider error', res.status, (await res.text()).slice(0, 300)); return null }
    const data = await res.json()
    const text: string | undefined = data?.choices?.[0]?.message?.content
    const parsed = JSON.parse(text ?? '{}') as Parsed
    console.log('Second provider answered', FALLBACK_LLM_MODEL)
    return parsed
  } catch (e) {
    console.error('Second provider failed', String(e))
    return null
  }
}
