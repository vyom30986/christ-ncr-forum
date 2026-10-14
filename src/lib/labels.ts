import type { Category, Status } from './types'

export const CATEGORIES: { key: Category; label: string; private?: boolean }[] = [
  { key: 'admissions', label: 'Admissions' },
  { key: 'classes', label: 'Classes' },
  { key: 'faculty', label: 'Faculty' },
  { key: 'student_life', label: 'Student Life' },
  { key: 'housing', label: 'Housing' },
  { key: 'tech_portal', label: 'Tech/Portal' },
  { key: 'safety', label: 'Safety', private: true },
  { key: 'canteen', label: 'Canteen' },
  { key: 'sports', label: 'Sports' },
  { key: 'events', label: 'Events' },
  { key: 'cia', label: 'CIA (Google Forms)' },
  { key: 'other', label: 'Other' },
]

export const categoryLabel = (k: Category | string) =>
  CATEGORIES.find((c) => c.key === k)?.label ?? k

/** Posts with more than this many upvotes are flagged Attention needed. */
export const ATTENTION_THRESHOLD = 50

/** Feed tabs: Attention, then every public category (Safety is private, so it never appears). */
export type FeedTab = 'all' | 'attention' | Category
export const FEED_TABS: { key: FeedTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Attention' },
  ...CATEGORIES.filter((c) => !c.private).map((c) => ({ key: c.key, label: c.label })),
]

export const STATUS: Record<Status, { label: string; bg: string; fg: string }> = {
  open: { label: 'Open', bg: 'var(--fg)', fg: 'var(--bg)' },
  acknowledged: { label: 'Acknowledged', bg: 'var(--purple)', fg: '#fff' },
  in_progress: { label: 'In progress', bg: 'var(--blue)', fg: '#fff' },
  resolved: { label: 'Resolved', bg: 'var(--green)', fg: '#0A0A0A' },
  rejected: { label: 'Rejected', bg: 'var(--pink)', fg: '#0A0A0A' },
}

export const STATUS_ORDER: Status[] = ['open', 'acknowledged', 'in_progress', 'resolved']

export const cohortLabel = (course: string | null, year: number | null) => {
  if (!course && !year) return 'Christ NCR'
  const yy = year ? `'${String(year).slice(-2)}` : ''
  return [course, yy].filter(Boolean).join(' ')
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

/** How admins see who posted: the student's name, or "Parent of <name>". */
export function reporterLabel(name: string | null | undefined, kind: 'student' | 'parent' | 'other' | null | undefined): string {
  const n = name ?? 'Unknown'
  if (kind === 'parent') return `Parent of ${n}`
  if (kind === 'other') return `Other (via ${n})`
  return n
}

export const REPORTER_KINDS = [
  { key: 'student', label: 'Student', icon: '🎓' },
  { key: 'parent', label: 'Parent', icon: '👪' },
  { key: 'other', label: 'Others', icon: '🧑‍🤝‍🧑' },
] as const
