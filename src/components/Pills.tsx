import { STATUS, categoryLabel, cohortLabel } from '../lib/labels'
import type { Status } from '../lib/types'

export const CatPill = ({ k }: { k: string }) => <span className="pill-cat">{categoryLabel(k)}</span>

export const CohortPill = ({ course, year, onCard }: { course: string | null; year: number | null; onCard?: boolean }) => (
  !course && !year ? null : <span className={`pill-cohort ${onCard ? 'on-bg' : ''}`}>{cohortLabel(course, year)}</span>
)

export const StatusPill = ({ s, style }: { s: Status; style?: React.CSSProperties }) => (
  <span className="pill-status" style={{ background: STATUS[s].bg, color: STATUS[s].fg, ...style }}>{STATUS[s].label}</span>
)

export const Timer = ({ text, color }: { text: string; color: string }) => (
  <div className="timer" style={{ color }}><i />{text}</div>
)
