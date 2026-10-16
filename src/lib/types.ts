export type Category =
  | 'admissions' | 'classes' | 'faculty' | 'student_life' | 'housing'
  | 'tech_portal' | 'safety' | 'canteen' | 'sports' | 'events' | 'cia' | 'other'

export type Status = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'rejected'

export type ReporterKind = 'student' | 'parent' | 'other'

export type Profile = {
  id: string
  email: string
  name: string
  course: string | null
  grad_year: number | null
  nationality?: string | null
  /** Who uses this account to complain: the student, or a parent on their behalf. */
  reporter_kind?: ReporterKind | null
  /** Set once the first-visit screen (nationality + reporter kind) is done. */
  onboarded_at?: string | null
  role: 'student' | 'admin'
}

/** Row of the public_complaints view: what students see. No identity. */
export type PublicComplaint = {
  id: string
  category: Category
  title: string
  body: string
  status: Status
  upvotes: number
  created_at: string
  updated_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  reopened_at: string | null
  course: string | null
  grad_year: number | null
  has_voted: boolean
  has_flagged: boolean
  is_mine: boolean
  attention: boolean
  /** Visible comments (not hidden by reports). */
  comments?: number
}

/** Row of the complaints table: what the author and admins see. */
export type OwnComplaint = {
  id: string
  author_id: string
  category: Category
  title: string
  body: string
  status: Status
  is_private: boolean
  reporter_kind?: ReporterKind
  hidden: boolean
  upvotes: number
  flags: number
  created_at: string
  updated_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  reopened_at: string | null
  checkin_due_at?: string | null
  checkin_answered_at?: string | null
  promised_days?: number | null
  escalated_at?: string | null
  escalations?: number
  attention?: boolean
  grace_days?: number
}

export type AdminComplaint = OwnComplaint & {
  profiles: Pick<Profile, 'name' | 'email' | 'course' | 'grad_year' | 'reporter_kind'> | null
}

export type PublicUpdate = {
  id: string
  complaint_id: string
  status: Status
  note: string | null
  created_at: string
}

export type AiReview = {
  category: Category
  clean_title: string
  contains_person_name: boolean
  abusive: boolean
  similar_ids: string[]
  degraded?: boolean
}

/** One row of admin_user_stats(). */
export type UserStats = Profile & {
  created_at: string
  nationality: string | null
  reporter_kind: ReporterKind | null
  onboarded_at: string | null
  complaints: number
  open_complaints: number
  resolved_complaints: number
  private_complaints: number
  hidden_complaints: number
  upvotes_received: number
  votes_cast: number
  flags_cast: number
  flags_received: number
  escalations: number
  last_complaint_at: string | null
}

export type UserDetail = {
  profile: Profile & { created_at: string }
  complaints: OwnComplaint[]
  votes: { complaint_id: string; created_at: string; title: string | null }[]
  flags: { complaint_id: string; created_at: string; reason: string; title: string | null }[]
  escalations: { complaint_id: string; created_at: string; title: string | null }[]
  identity_views: { viewed_at: string; complaint_id: string; admin_name: string | null; admin_email: string | null }[]
}

export type AdminEntry = {
  email: string
  added_at: string
  name: string | null
  course: string | null
  grad_year: number | null
  signed_in: boolean
  is_owner: boolean
  /** Owner, or an admin the owner allowed to delete complaints (0022). */
  can_delete: boolean
}

/** One upvote on a complaint, as admins see it. */
export type Voter = {
  user_id: string
  created_at: string
  profiles: Pick<Profile, 'name' | 'email' | 'course' | 'grad_year' | 'reporter_kind'> | null
}

/** Row of the public_comments view: anonymous, class only. */
export type PublicComment = {
  id: string
  complaint_id: string
  body: string
  created_at: string
  course: string | null
  grad_year: number | null
  /** Written by the post's own author. */
  by_op: boolean
  is_mine: boolean | null
  has_reported: boolean
}

/** admin_comments(): every comment on a post, hidden ones too, with the real name. */
export type AdminComment = {
  id: string
  complaint_id: string
  body: string
  created_at: string
  hidden: boolean
  reports: number
  by_op: boolean
  author_id: string
  name: string | null
  email: string | null
  course: string | null
  grad_year: number | null
  reporter_kind: ReporterKind | null
}

/** admin_reported_comments(): the comment report queue. */
export type ReportedComment = Omit<AdminComment, 'by_op' | 'author_id'> & { complaint_title: string; reasons: string[] }

/** A "Contact us" message from the sign-in page (admins only). */
export type ContactMessage = {
  id: string
  name: string
  contact: string | null
  message: string
  user_id: string | null
  created_at: string
}
