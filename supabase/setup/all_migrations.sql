-- Christ NCR Forum: full schema (0001..0019 in order). Paste into Supabase SQL editor and Run once.

-- ===================== 0001_init.sql =====================
-- =====================================================================
-- CU C/S  ·  schema, RLS, views, triggers
-- Run with:  supabase db push   (or paste into the SQL editor)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.complaint_category as enum (
  'admissions', 'classes', 'faculty', 'student_life', 'housing',
  'tech_portal', 'safety', 'canteen', 'sports', 'events', 'cia', 'other'
);

create type public.complaint_status as enum (
  'open', 'acknowledged', 'in_progress', 'resolved', 'rejected'
);

create type public.user_role as enum ('student', 'admin');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- Who is an admin. Source of truth for is_admin(); profiles.role mirrors it.
create table public.admins (
  email      text primary key check (email = lower(email)),
  added_at   timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  name       text not null,
  course     text,
  grad_year  int,
  role       public.user_role not null default 'student',
  created_at timestamptz not null default now()
);

create table public.complaints (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null references public.profiles (id) on delete cascade,
  category        public.complaint_category not null,
  title           text not null check (char_length(title) between 3 and 80),
  body            text not null check (char_length(body) between 10 and 1000),
  status          public.complaint_status not null default 'open',
  is_private      boolean not null default false,
  hidden          boolean not null default false,
  upvotes         int not null default 0,
  flags           int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at     timestamptz,
  reopened_at     timestamptz
);
create index complaints_feed_idx on public.complaints (hidden, is_private, status, created_at desc);
create index complaints_author_idx on public.complaints (author_id);
create index complaints_upvotes_idx on public.complaints (upvotes desc);

create table public.votes (
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (complaint_id, user_id)
);

create table public.flags (
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  reason       text not null check (char_length(reason) between 2 and 300),
  created_at   timestamptz not null default now(),
  primary key (complaint_id, user_id)
);

-- Status changes and official replies by admins.
create table public.updates (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  admin_id     uuid not null references public.profiles (id),
  status       public.complaint_status not null,
  note         text,
  created_at   timestamptz not null default now()
);
create index updates_complaint_idx on public.updates (complaint_id, created_at);

-- Audit log: which admin looked at which complainant's identity, and when.
create table public.admin_views (
  id           bigint generated always as identity primary key,
  admin_id     uuid not null references public.profiles (id),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  viewed_at    timestamptz not null default now()
);
create index admin_views_complaint_idx on public.admin_views (complaint_id, viewed_at desc);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- True when the caller's email is in the admins table.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- (superseded by 0019_christ_ncr.sql)
-- anything else                 ->  (local part, null, null)
create or replace function public.parse_christncr_email(p_email text,
  out name text, out course text, out grad_year int)
language plpgsql immutable
as $$
declare
  m text[];
begin
  m := regexp_match(lower(p_email), '^([a-z]+)\.([a-z]+)_([a-z]+)(\d{4})@christuniversity\.in$');
  if m is not null then
    name      := initcap(m[1]) || ' ' || initcap(m[2]);
    course    := upper(m[3]);
    grad_year := m[4]::int;
  else
    name      := split_part(p_email, '@', 1);
    course    := null;
    grad_year := null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Auth: only @christuniversity.in Google accounts may exist. Checked server-side on
-- the auth.users row itself, so a client that skips the hd hint still
-- cannot get in. Both the email suffix AND Google's hd claim must match.
-- ---------------------------------------------------------------------
create or replace function public.enforce_christncr_domain()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  hd text := coalesce(new.raw_user_meta_data ->> 'hd', '');
begin
  if lower(coalesce(new.email, '')) not like '%@christuniversity.in' or hd <> 'christuniversity.in' then
    raise exception 'Only @christuniversity.in Google accounts can use CU C/S'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_christncr_domain on auth.users;
create trigger enforce_christncr_domain
  before insert on auth.users
  for each row execute function public.enforce_christncr_domain();

-- First login: create the profile from the email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  p record;
begin
  select * into p from public.parse_christncr_email(new.email);
  insert into public.profiles (id, email, name, course, grad_year, role)
  values (
    new.id, lower(new.email), p.name, p.course, p.grad_year,
    case when exists (select 1 from public.admins a where a.email = lower(new.email))
         then 'admin'::public.user_role else 'student'::public.user_role end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.role in step with the admins table.
create or replace function public.sync_admin_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set role = 'admin' where email = new.email;
  elsif tg_op = 'DELETE' then
    update public.profiles set role = 'student' where email = old.email;
  end if;
  return null;
end;
$$;
create trigger admins_sync_role
  after insert or delete on public.admins
  for each row execute function public.sync_admin_role();

-- ---------------------------------------------------------------------
-- Counters + auto-hide
-- ---------------------------------------------------------------------
create or replace function public.bump_upvotes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.complaints set upvotes = upvotes + 1 where id = new.complaint_id;
  else
    update public.complaints set upvotes = greatest(upvotes - 1, 0) where id = old.complaint_id;
  end if;
  return null;
end; $$;
create trigger votes_bump after insert or delete on public.votes
  for each row execute function public.bump_upvotes();

-- Flags: count them, and hide the post once it reaches 3.
create or replace function public.bump_flags()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.complaints
       set flags  = flags + 1,
           hidden = case when flags + 1 >= 3 then true else hidden end
     where id = new.complaint_id;
  else
    update public.complaints set flags = greatest(flags - 1, 0) where id = old.complaint_id;
  end if;
  return null;
end; $$;
create trigger flags_bump after insert or delete on public.flags
  for each row execute function public.bump_flags();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
create trigger complaints_touch before update on public.complaints
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Realtime: broadcast a tiny, identity-free message on every change so
-- clients can refetch the public view. (postgres_changes would be
-- filtered by RLS and students would only ever hear about their own rows.)
-- ---------------------------------------------------------------------
create or replace function public.broadcast_complaint_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record := coalesce(new, old);
begin
  if r.is_private is distinct from true then
    perform realtime.send(
      jsonb_build_object('id', r.id, 'op', tg_op),
      'complaint', 'feed', true
    );
  end if;
  return null;
end; $$;
create trigger complaints_broadcast
  after insert or update or delete on public.complaints
  for each row execute function public.broadcast_complaint_change();

create or replace function public.broadcast_update_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.complaint_id, 'op', 'UPDATE'),
    'complaint', 'feed', true
  );
  return null;
end; $$;
create trigger updates_broadcast
  after insert on public.updates
  for each row execute function public.broadcast_update_change();

-- Anyone signed in may listen on the private "feed" topic.
create policy "authenticated can read feed broadcasts"
  on realtime.messages for select
  to authenticated
  using (realtime.topic() = 'feed' and extension = 'broadcast');

-- ---------------------------------------------------------------------
-- The ONLY way students read other people's complaints.
-- No author_id, no email, no name: just the cohort.
-- Runs as the view owner (not security_invoker) on purpose, so it can
-- read every row while the complaints table itself stays locked down.
-- ---------------------------------------------------------------------
create or replace view public.public_complaints
with (security_invoker = false) as
select
  c.id,
  c.category,
  c.title,
  c.body,
  c.status,
  c.upvotes,
  c.created_at,
  c.updated_at,
  c.acknowledged_at,
  c.resolved_at,
  c.reopened_at,
  p.course,
  p.grad_year,
  exists (select 1 from public.votes v where v.complaint_id = c.id and v.user_id = auth.uid()) as has_voted,
  exists (select 1 from public.flags f where f.complaint_id = c.id and f.user_id = auth.uid()) as has_flagged,
  (c.author_id = auth.uid()) as is_mine
from public.complaints c
join public.profiles p on p.id = c.author_id
where c.hidden = false and c.is_private = false;

revoke all on public.public_complaints from anon, public;
grant select on public.public_complaints to authenticated;

-- Official replies / status notes, without exposing which admin wrote them.
create or replace view public.public_updates
with (security_invoker = false) as
select u.id, u.complaint_id, u.status, u.note, u.created_at
from public.updates u
join public.complaints c on c.id = u.complaint_id
where (c.hidden = false and c.is_private = false) or c.author_id = auth.uid();

revoke all on public.public_updates from anon, public;
grant select on public.public_updates to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.admins      enable row level security;
alter table public.profiles    enable row level security;
alter table public.complaints  enable row level security;
alter table public.votes       enable row level security;
alter table public.flags       enable row level security;
alter table public.updates     enable row level security;
alter table public.admin_views enable row level security;

-- admins: readable by admins only (is_admin() itself is security definer)
create policy "admins read admins" on public.admins for select to authenticated using (public.is_admin());

-- profiles: you see yourself; admins see everyone
create policy "profiles self or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- complaints
create policy "complaints select own or admin" on public.complaints for select to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy "complaints insert own" on public.complaints for insert to authenticated
  with check (
    author_id = auth.uid()
    and status = 'open' and hidden = false and upvotes = 0 and flags = 0
    and acknowledged_at is null and resolved_at is null and reopened_at is null
    and (category <> 'safety' or is_private = true)   -- Safety is always private
  );

-- Students edit through edit_complaint() (upvotes = 0 rule). Admins edit freely.
create policy "complaints update admin" on public.complaints for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "complaints delete own or admin" on public.complaints for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- votes: one per user, toggle; only on complaints you can actually see
create policy "votes select own" on public.votes for select to authenticated using (user_id = auth.uid());
create policy "votes insert own" on public.votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.complaints c where c.id = complaint_id and c.hidden = false and c.is_private = false)
  );
create policy "votes delete own" on public.votes for delete to authenticated using (user_id = auth.uid());

-- flags: one per user, with a reason; admins can read the queue
create policy "flags select own or admin" on public.flags for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "flags insert own" on public.flags for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.complaints c where c.id = complaint_id and c.is_private = false)
  );
create policy "flags delete own" on public.flags for delete to authenticated using (user_id = auth.uid());

-- updates: written only through admin RPCs; admins may read raw rows
create policy "updates select admin" on public.updates for select to authenticated using (public.is_admin());

-- admin_views: admins write their own entries and can read the log
create policy "admin_views insert" on public.admin_views for insert to authenticated
  with check (public.is_admin() and admin_id = auth.uid());
create policy "admin_views select" on public.admin_views for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- RPCs (security definer, with their own checks)
-- ---------------------------------------------------------------------

-- Student: edit title/body only while nobody has upvoted.
create or replace function public.edit_complaint(p_id uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints;
begin
  select * into c from public.complaints where id = p_id for update;
  if c.id is null or c.author_id <> auth.uid() then
    raise exception 'Not your complaint' using errcode = '42501';
  end if;
  if c.upvotes > 0 then
    raise exception 'This complaint has upvotes and can no longer be edited' using errcode = 'P0001';
  end if;
  update public.complaints set title = p_title, body = p_body where id = p_id;
end; $$;

-- Student: reopen within 7 days of resolution.
create or replace function public.reopen_complaint(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints;
begin
  select * into c from public.complaints where id = p_id for update;
  if c.id is null or c.author_id <> auth.uid() then
    raise exception 'Not your complaint' using errcode = '42501';
  end if;
  if c.status <> 'resolved' or c.resolved_at is null then
    raise exception 'Only resolved complaints can be reopened' using errcode = 'P0001';
  end if;
  if c.resolved_at < now() - interval '7 days' then
    raise exception 'Complaints can only be reopened within 7 days of resolution' using errcode = 'P0001';
  end if;
  update public.complaints
     set status = 'open', reopened_at = now(), resolved_at = null
   where id = p_id;
end; $$;

-- Admin: change status (rejected requires a note). Writes the updates row
-- that the notification webhook listens to.
create or replace function public.admin_set_status(p_id uuid, p_status public.complaint_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_status = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'A note is required when rejecting a complaint' using errcode = 'P0001';
  end if;
  update public.complaints
     set status          = p_status,
         acknowledged_at = case when p_status = 'acknowledged' and acknowledged_at is null then now() else acknowledged_at end,
         resolved_at     = case when p_status = 'resolved' then now()
                                when p_status in ('open','acknowledged','in_progress') then null
                                else resolved_at end
   where id = p_id;
  if not found then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;
  insert into public.updates (complaint_id, admin_id, status, note)
  values (p_id, auth.uid(), p_status, nullif(btrim(p_note), ''));
end; $$;

-- Admin: official reply without changing status.
create or replace function public.admin_reply(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.complaint_status;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Reply cannot be empty' using errcode = 'P0001';
  end if;
  select status into s from public.complaints where id = p_id;
  if s is null then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;
  insert into public.updates (complaint_id, admin_id, status, note) values (p_id, auth.uid(), s, btrim(p_note));
end; $$;

-- Admin: record that identities were looked at.
create or replace function public.log_admin_view(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  insert into public.admin_views (admin_id, complaint_id)
  select auth.uid(), unnest(p_ids);
end; $$;

-- Admin: unhide and clear flags after review.
create or replace function public.admin_restore(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  delete from public.flags where complaint_id = p_id;
  update public.complaints set hidden = false, flags = 0 where id = p_id;
end; $$;

-- Everyone signed in may call these; each one re-checks the caller inside.
revoke all on function public.edit_complaint(uuid, text, text) from public, anon;
revoke all on function public.reopen_complaint(uuid) from public, anon;
revoke all on function public.admin_set_status(uuid, public.complaint_status, text) from public, anon;
revoke all on function public.admin_reply(uuid, text) from public, anon;
revoke all on function public.log_admin_view(uuid[]) from public, anon;
revoke all on function public.admin_restore(uuid) from public, anon;
grant execute on function public.edit_complaint(uuid, text, text) to authenticated;
grant execute on function public.reopen_complaint(uuid) to authenticated;
grant execute on function public.admin_set_status(uuid, public.complaint_status, text) to authenticated;
grant execute on function public.admin_reply(uuid, text) to authenticated;
grant execute on function public.log_admin_view(uuid[]) to authenticated;
grant execute on function public.admin_restore(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- The first admin is seeded in 0005_admin_access.sql; add more from Admin > Access, or:
-- insert into public.admins (email) values ('name.surname@bbafth.christuniversity.in');

-- ===================== 0002_checkins.sql =====================
-- =====================================================================
-- CU C/S · follow-up check-ins and escalation
--
-- 3 business days after a complaint is posted, the author is asked
-- "Has this been solved?"
--   Yes                      -> complaint is closed as resolved
--   No, fix promised in N days (1-7) -> ask again after N days
--   No, nothing promised     -> escalate: admins + the people in charge
--                               are emailed; ask again in 3 business days
-- =====================================================================

alter table public.complaints
  add column checkin_due_at      timestamptz,
  add column checkin_answered_at timestamptz,
  add column promised_days       int check (promised_days between 1 and 7),
  add column escalated_at        timestamptz,
  add column escalations         int not null default 0;

create index complaints_checkin_idx on public.complaints (author_id, checkin_due_at)
  where checkin_due_at is not null;

-- Audit + webhook source for escalation emails.
create table public.escalations (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now()
);
alter table public.escalations enable row level security;
create policy "escalations select admin" on public.escalations for select to authenticated using (public.is_admin());

-- Skip Saturdays and Sundays.
create or replace function public.add_business_days(p_from timestamptz, p_days int)
returns timestamptz language plpgsql immutable as $$
declare
  d timestamptz := p_from;
  n int := 0;
begin
  while n < p_days loop
    d := d + interval '1 day';
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end; $$;

-- Schedule the first check-in when a complaint is posted.
create or replace function public.schedule_first_checkin()
returns trigger language plpgsql as $$
begin
  new.checkin_due_at := public.add_business_days(new.created_at, 3);
  return new;
end; $$;
create trigger complaints_schedule_checkin
  before insert on public.complaints
  for each row execute function public.schedule_first_checkin();

-- Stop asking once an admin resolves or rejects; restart when reopened.
create or replace function public.sync_checkin_on_status()
returns trigger language plpgsql as $$
begin
  if new.status in ('resolved', 'rejected') then
    new.checkin_due_at := null;
  elsif old.status in ('resolved', 'rejected') and new.status not in ('resolved', 'rejected') then
    new.checkin_due_at := public.add_business_days(now(), 3);
    new.promised_days := null;
  end if;
  return new;
end; $$;
create trigger complaints_sync_checkin
  before update of status on public.complaints
  for each row execute function public.sync_checkin_on_status();

-- The author answers the pop-up.
create or replace function public.answer_checkin(p_id uuid, p_solved boolean, p_promised_days int default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints;
begin
  select * into c from public.complaints where id = p_id for update;
  if c.id is null or c.author_id <> auth.uid() then
    raise exception 'Not your complaint' using errcode = '42501';
  end if;
  if c.status in ('resolved', 'rejected') then
    raise exception 'This complaint is already closed' using errcode = 'P0001';
  end if;

  if p_solved then
    update public.complaints
       set status = 'resolved', resolved_at = now(),
           checkin_answered_at = now(), checkin_due_at = null, promised_days = null
     where id = p_id;

  elsif p_promised_days is not null then
    if p_promised_days not between 1 and 7 then
      raise exception 'Promised days must be between 1 and 7' using errcode = 'P0001';
    end if;
    update public.complaints
       set checkin_answered_at = now(),
           promised_days = p_promised_days,
           checkin_due_at = now() + make_interval(days => p_promised_days)
     where id = p_id;

  else
    update public.complaints
       set checkin_answered_at = now(),
           promised_days = null,
           escalated_at = now(),
           escalations = escalations + 1,
           checkin_due_at = public.add_business_days(now(), 3)
     where id = p_id;
    insert into public.escalations (complaint_id, author_id) values (p_id, auth.uid());
  end if;
end; $$;

revoke all on function public.answer_checkin(uuid, boolean, int) from public, anon;
grant execute on function public.answer_checkin(uuid, boolean, int) to authenticated;

-- Tell every signed-in client something changed (admin list shows the badge).
create or replace function public.broadcast_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(jsonb_build_object('id', new.complaint_id, 'op', 'ESCALATE'), 'complaint', 'feed', true);
  return null;
end; $$;
create trigger escalations_broadcast
  after insert on public.escalations
  for each row execute function public.broadcast_escalation();

-- ===================== 0003_attention.sql =====================
-- =====================================================================
-- CU C/S · "Attention needed": any post with more than 50 upvotes.
-- Stored generated column, so it is always in step with the vote count
-- and can be filtered / indexed directly.
-- =====================================================================

alter table public.complaints
  add column attention boolean generated always as (upvotes > 50) stored;

create index complaints_attention_idx on public.complaints (attention, upvotes desc)
  where attention = true;

-- Expose it on the student view (adding a column at the end is allowed by
-- create or replace view).
create or replace view public.public_complaints
with (security_invoker = false) as
select
  c.id,
  c.category,
  c.title,
  c.body,
  c.status,
  c.upvotes,
  c.created_at,
  c.updated_at,
  c.acknowledged_at,
  c.resolved_at,
  c.reopened_at,
  p.course,
  p.grad_year,
  exists (select 1 from public.votes v where v.complaint_id = c.id and v.user_id = auth.uid()) as has_voted,
  exists (select 1 from public.flags f where f.complaint_id = c.id and f.user_id = auth.uid()) as has_flagged,
  (c.author_id = auth.uid()) as is_mine,
  c.attention
from public.complaints c
join public.profiles p on p.id = c.author_id
where c.hidden = false and c.is_private = false;

revoke all on public.public_complaints from anon, public;
grant select on public.public_complaints to authenticated;

-- ===================== 0004_admin_users.sql =====================
-- =====================================================================
-- CU C/S · admin user directory
-- Admins can read every vote (for per-user activity) and get per-user
-- aggregates in one call.
-- =====================================================================

create policy "votes select admin" on public.votes for select to authenticated using (public.is_admin());

create or replace function public.admin_user_stats()
returns table (
  id uuid, email text, name text, course text, grad_year int, role public.user_role, created_at timestamptz,
  complaints bigint, open_complaints bigint, resolved_complaints bigint, private_complaints bigint, hidden_complaints bigint,
  upvotes_received bigint, votes_cast bigint, flags_cast bigint, flags_received bigint, escalations bigint,
  last_complaint_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.email, p.name, p.course, p.grad_year, p.role, p.created_at,
    count(c.id)                                                        as complaints,
    count(c.id) filter (where c.status in ('open','acknowledged','in_progress')) as open_complaints,
    count(c.id) filter (where c.status = 'resolved')                   as resolved_complaints,
    count(c.id) filter (where c.is_private)                            as private_complaints,
    count(c.id) filter (where c.hidden)                                as hidden_complaints,
    coalesce(sum(c.upvotes), 0)                                        as upvotes_received,
    (select count(*) from public.votes v where v.user_id = p.id)       as votes_cast,
    (select count(*) from public.flags f where f.user_id = p.id)       as flags_cast,
    coalesce(sum(c.flags), 0)                                          as flags_received,
    coalesce(sum(c.escalations), 0)                                    as escalations,
    max(c.created_at)                                                  as last_complaint_at
  from public.profiles p
  left join public.complaints c on c.author_id = p.id
  where public.is_admin()
  group by p.id
  order by complaints desc, upvotes_received desc, p.name;
$$;

revoke all on function public.admin_user_stats() from public, anon;
grant execute on function public.admin_user_stats() to authenticated;

-- ===================== 0005_admin_access.sql =====================
-- =====================================================================
-- CU C/S · admin access management
-- First admin is seeded here; after that, admins add and remove other
-- admins from the app (Admin > Access). profiles.role follows via the
-- existing admins_sync_role trigger.
-- =====================================================================

insert into public.admins (email) values ('vyomahuja30122009@gmail.com')
on conflict (email) do nothing;

-- Who is on the list, plus whether they have signed in yet.
create or replace function public.admin_list()
returns table (email text, added_at timestamptz, name text, course text, grad_year int, signed_in boolean)
language sql stable security definer set search_path = public as $$
  select a.email, a.added_at, p.name, p.course, p.grad_year, (p.id is not null) as signed_in
  from public.admins a
  left join public.profiles p on p.email = a.email
  where public.is_admin()
  order by a.added_at;
$$;

create or replace function public.admin_grant(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(p_email));
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if e !~ '^[a-z0-9._%+-]+@christuniversity\.in$' then
    raise exception 'Admins must use a @christuniversity.in address' using errcode = 'P0001';
  end if;
  insert into public.admins (email) values (e) on conflict (email) do nothing;
end; $$;

create or replace function public.admin_revoke(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(p_email));
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if e = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'You cannot remove your own admin access' using errcode = 'P0001';
  end if;
  if (select count(*) from public.admins) <= 1 then
    raise exception 'There must always be at least one admin' using errcode = 'P0001';
  end if;
  delete from public.admins where email = e;
end; $$;

revoke all on function public.admin_list() from public, anon;
revoke all on function public.admin_grant(text) from public, anon;
revoke all on function public.admin_revoke(text) from public, anon;
grant execute on function public.admin_list() to authenticated;
grant execute on function public.admin_grant(text) to authenticated;
grant execute on function public.admin_revoke(text) to authenticated;

-- ===================== 0006_grace_days.sql =====================
-- =====================================================================
-- CU C/S · the reporter chooses how many working days to give before
-- the follow-up check-in (and therefore before escalation can start).
-- =====================================================================

alter table public.complaints
  add column grace_days int not null default 3 check (grace_days between 1 and 14);

-- First check-in uses the chosen grace period instead of a fixed 3 days.
create or replace function public.schedule_first_checkin()
returns trigger language plpgsql as $$
begin
  new.checkin_due_at := public.add_business_days(new.created_at, coalesce(new.grace_days, 3));
  return new;
end; $$;

-- Reopening restarts the clock with the same grace period.
create or replace function public.sync_checkin_on_status()
returns trigger language plpgsql as $$
begin
  if new.status in ('resolved', 'rejected') then
    new.checkin_due_at := null;
  elsif old.status in ('resolved', 'rejected') and new.status not in ('resolved', 'rejected') then
    new.checkin_due_at := public.add_business_days(now(), coalesce(new.grace_days, 3));
    new.promised_days := null;
  end if;
  return new;
end; $$;

-- ===================== 0007_owner.sql =====================
-- =====================================================================
-- CU C/S · the owner
-- vyomahuja30122009@gmail.com is the permanent owner: cannot be removed
-- by anyone, and is the only account that can grant or revoke admin
-- access. Other admins keep every other admin power.
-- =====================================================================

alter table public.admins add column is_owner boolean not null default false;

insert into public.admins (email, is_owner) values ('vyomahuja30122009@gmail.com', true)
on conflict (email) do update set is_owner = true;

create unique index admins_single_owner on public.admins (is_owner) where is_owner;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    where a.is_owner and a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_owner() to authenticated;

-- Belt and braces: the owner row cannot be deleted or demoted, even in SQL.
create or replace function public.protect_owner()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.is_owner then
    raise exception 'The owner cannot be removed' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.is_owner and not new.is_owner then
    raise exception 'The owner cannot be demoted' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end; $$;
create trigger admins_protect_owner
  before update or delete on public.admins
  for each row execute function public.protect_owner();

-- List now says who the owner is.
drop function public.admin_list();
create or replace function public.admin_list()
returns table (email text, added_at timestamptz, name text, course text, grad_year int, signed_in boolean, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select a.email, a.added_at, p.name, p.course, p.grad_year, (p.id is not null) as signed_in, a.is_owner
  from public.admins a
  left join public.profiles p on p.email = a.email
  where public.is_admin()
  order by a.is_owner desc, a.added_at;
$$;
revoke all on function public.admin_list() from public, anon;
grant execute on function public.admin_list() to authenticated;

-- Only the owner grants or revokes.
create or replace function public.admin_grant(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(p_email));
begin
  if not public.is_owner() then
    raise exception 'Only the owner can add admins' using errcode = '42501';
  end if;
  if e !~ '^[a-z0-9._%+-]+@christuniversity\.in$' then
    raise exception 'Admins must use a @christuniversity.in address' using errcode = 'P0001';
  end if;
  insert into public.admins (email) values (e) on conflict (email) do nothing;
end; $$;

create or replace function public.admin_revoke(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(p_email));
begin
  if not public.is_owner() then
    raise exception 'Only the owner can remove admins' using errcode = '42501';
  end if;
  if exists (select 1 from public.admins a where a.email = e and a.is_owner) then
    raise exception 'The owner cannot be removed' using errcode = 'P0001';
  end if;
  delete from public.admins where email = e;
end; $$;

-- ===================== 0008_fixes.sql =====================
-- =====================================================================
-- CU C/S · fixes from the pre-launch audit
-- 1. votes/flags insert policies looked up the complaint through RLS, so
--    students could only vote on their own posts. Use a definer helper.
-- 2. Google stores the hosted-domain claim under custom_claims.hd, not
--    hd, so the sign-up trigger rejected everyone. Read both; require the
--    domain only when Google sends it (Workspace accounts), always
--    require the @christuniversity.in suffix.
-- 3. Broadcasts for updates/escalations no longer mention private or
--    hidden complaints.
-- 4. Deleting an admin's account no longer fails on updates/admin_views.
-- 5. Pure helper functions are not callable by anon.
-- =====================================================================

-- 1 ------------------------------------------------------------------
create or replace function public.complaint_is_public(p_id uuid, p_allow_hidden boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.complaints c
    where c.id = p_id and c.is_private = false and (p_allow_hidden or c.hidden = false)
  );
$$;
revoke all on function public.complaint_is_public(uuid, boolean) from public, anon;
grant execute on function public.complaint_is_public(uuid, boolean) to authenticated;

drop policy "votes insert own" on public.votes;
create policy "votes insert own" on public.votes for insert to authenticated
  with check (user_id = auth.uid() and public.complaint_is_public(complaint_id, false));

drop policy "flags insert own" on public.flags;
create policy "flags insert own" on public.flags for insert to authenticated
  with check (user_id = auth.uid() and public.complaint_is_public(complaint_id, true));

-- 2 ------------------------------------------------------------------
create or replace function public.enforce_christncr_domain()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  hd text := coalesce(new.raw_user_meta_data -> 'custom_claims' ->> 'hd',
                      new.raw_user_meta_data ->> 'hd', '');
begin
  if lower(coalesce(new.email, '')) not like '%@christuniversity.in' then
    raise exception 'Only @christuniversity.in Google accounts can use CU C/S' using errcode = 'P0001';
  end if;
  -- Workspace accounts carry hd; if it is there it must be christuniversity.in.
  if hd <> '' and hd <> 'christuniversity.in' then
    raise exception 'Only @christuniversity.in Google accounts can use CU C/S' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- 3 ------------------------------------------------------------------
create or replace function public.broadcast_update_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.complaint_is_public(new.complaint_id, false) then
    perform realtime.send(jsonb_build_object('id', new.complaint_id, 'op', 'UPDATE'), 'complaint', 'feed', true);
  end if;
  return null;
end; $$;

create or replace function public.broadcast_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.complaint_is_public(new.complaint_id, false) then
    perform realtime.send(jsonb_build_object('id', new.complaint_id, 'op', 'ESCALATE'), 'complaint', 'feed', true);
  end if;
  return null;
end; $$;

-- 4 ------------------------------------------------------------------
alter table public.updates alter column admin_id drop not null;
alter table public.updates drop constraint updates_admin_id_fkey;
alter table public.updates
  add constraint updates_admin_id_fkey foreign key (admin_id) references public.profiles (id) on delete set null;

alter table public.admin_views alter column admin_id drop not null;
alter table public.admin_views drop constraint admin_views_admin_id_fkey;
alter table public.admin_views
  add constraint admin_views_admin_id_fkey foreign key (admin_id) references public.profiles (id) on delete set null;

-- 5 ------------------------------------------------------------------
revoke all on function public.parse_christncr_email(text) from public, anon;
revoke all on function public.add_business_days(timestamptz, int) from public, anon;

-- ===================== 0009_nationality.sql =====================
-- =====================================================================
-- CU C/S · nationality on the profile (set by the student, shown to
-- admins; never exposed to other students).
-- =====================================================================
alter table public.profiles add column nationality text check (char_length(nationality) between 2 and 60);

-- Students may change only their nationality, nothing else on the profile.
create or replace function public.set_nationality(p_nationality text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(p_nationality), '');
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.profiles set nationality = v where id = auth.uid();
end; $$;
revoke all on function public.set_nationality(text) from public, anon;
grant execute on function public.set_nationality(text) to authenticated;

-- Admin directory shows it too.
drop function public.admin_user_stats();
create or replace function public.admin_user_stats()
returns table (
  id uuid, email text, name text, course text, grad_year int, nationality text, role public.user_role, created_at timestamptz,
  complaints bigint, open_complaints bigint, resolved_complaints bigint, private_complaints bigint, hidden_complaints bigint,
  upvotes_received bigint, votes_cast bigint, flags_cast bigint, flags_received bigint, escalations bigint,
  last_complaint_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.email, p.name, p.course, p.grad_year, p.nationality, p.role, p.created_at,
    count(c.id)                                                        as complaints,
    count(c.id) filter (where c.status in ('open','acknowledged','in_progress')) as open_complaints,
    count(c.id) filter (where c.status = 'resolved')                   as resolved_complaints,
    count(c.id) filter (where c.is_private)                            as private_complaints,
    count(c.id) filter (where c.hidden)                                as hidden_complaints,
    coalesce(sum(c.upvotes), 0)                                        as upvotes_received,
    (select count(*) from public.votes v where v.user_id = p.id)       as votes_cast,
    (select count(*) from public.flags f where f.user_id = p.id)       as flags_cast,
    coalesce(sum(c.flags), 0)                                          as flags_received,
    coalesce(sum(c.escalations), 0)                                    as escalations,
    max(c.created_at)                                                  as last_complaint_at
  from public.profiles p
  left join public.complaints c on c.author_id = p.id
  where public.is_admin()
  group by p.id
  order by complaints desc, upvotes_received desc, p.name;
$$;
revoke all on function public.admin_user_stats() from public, anon;
grant execute on function public.admin_user_stats() to authenticated;

-- ===================== 0010_nationality_check.sql =====================
-- Friendlier error than the raw check-constraint message.
create or replace function public.set_nationality(p_nationality text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(p_nationality), '');
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if v is not null and char_length(v) < 2 then
    raise exception 'Nationality needs at least 2 characters' using errcode = 'P0001';
  end if;
  if v is not null and char_length(v) > 60 then
    raise exception 'Nationality is too long (60 characters max)' using errcode = 'P0001';
  end if;
  update public.profiles set nationality = v where id = auth.uid();
end; $$;

-- ===================== 0011_reporter_kind.sql =====================
-- CU C/S · first-visit onboarding: nationality + who is complaining.
-- A @christuniversity.in account may be used by the student or by a parent on the
-- student's behalf. The choice lives on the profile and is stamped on each
-- complaint at posting time, so admins always see the right label.

create type public.reporter_kind as enum ('student', 'parent');

alter table public.profiles
  add column reporter_kind public.reporter_kind,
  add column onboarded_at timestamptz;

alter table public.complaints
  add column reporter_kind public.reporter_kind not null default 'student';

-- Stamp the reporter kind from the profile when a complaint is created.
create or replace function public.stamp_reporter_kind()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select coalesce(p.reporter_kind, 'student') into new.reporter_kind
  from public.profiles p where p.id = new.author_id;
  if new.reporter_kind is null then new.reporter_kind := 'student'; end if;
  return new;
end;
$$;
drop trigger if exists complaints_stamp_reporter on public.complaints;
create trigger complaints_stamp_reporter
  before insert on public.complaints
  for each row execute function public.stamp_reporter_kind();

-- Onboarding (and later edits from Settings): nationality + reporter kind.
-- Nothing else on the profile is editable by the user.
create or replace function public.complete_onboarding(p_nationality text, p_reporter_kind public.reporter_kind)
returns void
language plpgsql security definer set search_path = public
as $$
declare v text := nullif(btrim(p_nationality), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if v is null or char_length(v) < 2 then raise exception 'Nationality is required'; end if;
  if char_length(v) > 60 then raise exception 'Nationality is too long (60 characters max)'; end if;
  update public.profiles
     set nationality = v,
         reporter_kind = p_reporter_kind,
         onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid();
end;
$$;
revoke all on function public.complete_onboarding(text, public.reporter_kind) from public, anon;
grant execute on function public.complete_onboarding(text, public.reporter_kind) to authenticated;

-- Admin directory shows it too.
drop function public.admin_user_stats();
create or replace function public.admin_user_stats()
returns table (
  id uuid, email text, name text, course text, grad_year int, nationality text, reporter_kind public.reporter_kind,
  onboarded_at timestamptz, role public.user_role, created_at timestamptz,
  complaints bigint, open_complaints bigint, resolved_complaints bigint, private_complaints bigint, hidden_complaints bigint,
  upvotes_received bigint, votes_cast bigint, flags_cast bigint, flags_received bigint, escalations bigint,
  last_complaint_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.email, p.name, p.course, p.grad_year, p.nationality, p.reporter_kind, p.onboarded_at, p.role, p.created_at,
    count(c.id)                                                        as complaints,
    count(c.id) filter (where c.status in ('open','acknowledged','in_progress')) as open_complaints,
    count(c.id) filter (where c.status = 'resolved')                   as resolved_complaints,
    count(c.id) filter (where c.is_private)                            as private_complaints,
    count(c.id) filter (where c.hidden)                                as hidden_complaints,
    coalesce(sum(c.upvotes), 0)                                        as upvotes_received,
    (select count(*) from public.votes v where v.user_id = p.id)       as votes_cast,
    (select count(*) from public.flags f where f.user_id = p.id)       as flags_cast,
    coalesce(sum(c.flags), 0)                                          as flags_received,
    coalesce(sum(c.escalations), 0)                                    as escalations,
    max(c.created_at)                                                  as last_complaint_at
  from public.profiles p
  left join public.complaints c on c.author_id = p.id
  where public.is_admin()
  group by p.id
$$;
revoke all on function public.admin_user_stats() from public, anon;
grant execute on function public.admin_user_stats() to authenticated;

-- ===================== 0012_reporter_other.sql =====================
-- CU C/S · a third reporter kind: "other" (a relative, guardian, friend
-- or anyone else using the student's account). Admins see
-- "Other (via <student name>)".
alter type public.reporter_kind add value if not exists 'other';

-- ===================== 0013_onboarding_name.sql =====================
-- CU C/S · staff and other non-standard @christuniversity.in addresses cannot be
-- parsed into name/course/year, so the first-visit screen asks for a name.
-- The name may only be set this way while the profile is unparsed
-- (course is null); student profiles keep the name derived from the email.

drop function if exists public.complete_onboarding(text, public.reporter_kind);

create or replace function public.complete_onboarding(
  p_nationality text,
  p_reporter_kind public.reporter_kind,
  p_name text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v text := nullif(btrim(p_nationality), '');
  n text := nullif(btrim(coalesce(p_name, '')), '');
  unparsed boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if v is null or char_length(v) < 2 then raise exception 'Nationality is required'; end if;
  if char_length(v) > 60 then raise exception 'Nationality is too long (60 characters max)'; end if;

  select (course is null) into unparsed from public.profiles where id = auth.uid();
  if unparsed and n is null then raise exception 'Please enter your name'; end if;
  if n is not null and (char_length(n) < 2 or char_length(n) > 80) then
    raise exception 'Name must be between 2 and 80 characters';
  end if;

  update public.profiles
     set nationality = v,
         reporter_kind = p_reporter_kind,
         name = case when unparsed and n is not null then n else name end,
         onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid();
end;
$$;
revoke all on function public.complete_onboarding(text, public.reporter_kind, text) from public, anon;
grant execute on function public.complete_onboarding(text, public.reporter_kind, text) to authenticated;

-- ===================== 0014_contact_messages.sql =====================
-- CU C/S · "Contact us" from the sign-in page.
-- Anyone (signed in or not) can send a short message, max 200 words.
-- Only admins can read or delete them. One-way: there is no reply.

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  contact    text check (contact is null or char_length(contact) <= 120),
  message    text not null check (
               char_length(btrim(message)) between 5 and 2000
               and coalesce(array_length(regexp_split_to_array(btrim(message), '\s+'), 1), 0) <= 200
             ),
  user_id    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

create policy "contact insert anyone" on public.contact_messages for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create policy "contact select admin" on public.contact_messages for select to authenticated
  using (public.is_admin());
create policy "contact delete admin" on public.contact_messages for delete to authenticated
  using (public.is_admin());

grant insert on public.contact_messages to anon, authenticated;
grant select, delete on public.contact_messages to authenticated;

-- Basic flood guard: at most 20 messages per minute across everyone.
create or replace function public.contact_rate_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many messages right now. Please try again in a minute.' using errcode = 'P0001';
  end if;
  new.name := btrim(new.name);
  new.contact := nullif(btrim(coalesce(new.contact, '')), '');
  new.message := btrim(new.message);
  new.created_at := now();
  return new;
end;
$$;
create trigger contact_messages_rate_limit
  before insert on public.contact_messages
  for each row execute function public.contact_rate_limit();

-- ===================== 0015_super_admin.sql =====================
-- CU C/S · super admin vs view-only admins.
-- The owner (public.is_owner()) is the super admin: every change goes
-- through them. Every other admin can look (names, complaints, users,
-- voters) but cannot change anything, and cannot see the Contact us inbox.
-- New admin features should check public.is_owner() unless explicitly
-- meant for view-only admins.

-- Complaints: only the owner may edit or delete other people's complaints.
drop policy if exists "complaints update admin" on public.complaints;
create policy "complaints update owner" on public.complaints for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "complaints delete own or admin" on public.complaints;
create policy "complaints delete own or owner" on public.complaints for delete to authenticated
  using (author_id = auth.uid() or public.is_owner());

-- Contact us inbox: owner only.
drop policy if exists "contact select admin" on public.contact_messages;
drop policy if exists "contact delete admin" on public.contact_messages;
create policy "contact select owner" on public.contact_messages for select to authenticated
  using (public.is_owner());
create policy "contact delete owner" on public.contact_messages for delete to authenticated
  using (public.is_owner());

-- Status changes, official replies, restoring flagged posts: owner only.
create or replace function public.admin_set_status(p_id uuid, p_status public.complaint_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'View-only admin: only the super admin can change a status' using errcode = '42501';
  end if;
  if p_status = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'A note is required when rejecting a complaint' using errcode = 'P0001';
  end if;
  update public.complaints
     set status          = p_status,
         acknowledged_at = case when p_status = 'acknowledged' and acknowledged_at is null then now() else acknowledged_at end,
         resolved_at     = case when p_status = 'resolved' then now()
                                when p_status in ('open','acknowledged','in_progress') then null
                                else resolved_at end
   where id = p_id;
  if not found then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;
  insert into public.updates (complaint_id, admin_id, status, note)
  values (p_id, auth.uid(), p_status, nullif(btrim(p_note), ''));
end; $$;

create or replace function public.admin_reply(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.complaint_status;
begin
  if not public.is_owner() then
    raise exception 'View-only admin: only the super admin can reply' using errcode = '42501';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Reply cannot be empty' using errcode = 'P0001';
  end if;
  select status into s from public.complaints where id = p_id;
  if s is null then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;
  insert into public.updates (complaint_id, admin_id, status, note) values (p_id, auth.uid(), s, btrim(p_note));
end; $$;

create or replace function public.admin_restore(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'View-only admin: only the super admin can restore posts' using errcode = '42501';
  end if;
  delete from public.flags where complaint_id = p_id;
  update public.complaints set hidden = false, flags = 0 where id = p_id;
end; $$;

-- ===================== 0016_guest_read.sql =====================
-- =====================================================================
-- Christ NCR Forum · guests can read the public board without signing in.
-- Only the two cohort-level views are opened to the anon role: no names,
-- no emails, no author ids, no private or hidden posts. For a guest
-- auth.uid() is null, so has_voted / has_flagged are false and is_mine
-- is null. Posting, voting and flagging still need a signed-in account.
-- =====================================================================

grant select on public.public_complaints to anon;
grant select on public.public_updates    to anon;

-- ===================== 0017_hardening.sql =====================
-- =====================================================================
-- Christ NCR Forum · security hardening (audit of 2026-10-13)
-- 1. Fields the server owns can no longer be set by the client on insert
--    (a student could backdate created_at or fake an escalation).
-- 2. Rate limits: complaints and flags per user; AI reviews per user.
-- 3. Least-privilege table grants: anon keeps only what guests need;
--    nobody but the owner role may TRUNCATE (TRUNCATE skips RLS).
-- =====================================================================

-- 1 ------------------------------------------------------------------
create or replace function public.sanitize_new_complaint()
returns trigger language plpgsql as $$
begin
  new.created_at          := now();
  new.updated_at          := now();
  new.escalated_at        := null;
  new.escalations         := 0;
  new.promised_days       := null;
  new.checkin_answered_at := null;
  return new;  -- checkin_due_at is set afterwards by complaints_schedule_checkin
end; $$;
-- Same-timing triggers fire in name order: "aa" runs before schedule_checkin.
drop trigger if exists complaints_aa_sanitize on public.complaints;
create trigger complaints_aa_sanitize
  before insert on public.complaints
  for each row execute function public.sanitize_new_complaint();

create or replace function public.stamp_now_created_at()
returns trigger language plpgsql as $$
begin new.created_at := now(); return new; end; $$;
drop trigger if exists votes_aa_now on public.votes;
create trigger votes_aa_now before insert on public.votes
  for each row execute function public.stamp_now_created_at();
drop trigger if exists flags_aa_now on public.flags;
create trigger flags_aa_now before insert on public.flags
  for each row execute function public.stamp_now_created_at();

-- 2 ------------------------------------------------------------------
create or replace function public.complaint_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare last_hour int; last_day int;
begin
  if public.is_owner() then return new; end if;
  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*) filter (where created_at > now() - interval '1 day')
    into last_hour, last_day
    from public.complaints where author_id = new.author_id;
  if last_hour >= 5 then
    raise exception 'You have posted 5 complaints in the last hour. Please wait a little before posting again.' using errcode = 'P0001';
  end if;
  if last_day >= 15 then
    raise exception 'You have reached today''s limit of 15 complaints. Please try again tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end; $$;
drop trigger if exists complaints_ab_rate_limit on public.complaints;
create trigger complaints_ab_rate_limit
  before insert on public.complaints
  for each row execute function public.complaint_rate_limit();

create or replace function public.flag_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.flags where user_id = new.user_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many flags in the last hour. Please try again later.' using errcode = 'P0001';
  end if;
  return new;
end; $$;
drop trigger if exists flags_ab_rate_limit on public.flags;
create trigger flags_ab_rate_limit
  before insert on public.flags
  for each row execute function public.flag_rate_limit();

-- AI review calls, written and read only by the ai-review edge function
-- (service role). 30 per user per hour, so nobody can burn the shared quota.
create table if not exists public.ai_calls (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_calls_user_idx on public.ai_calls (user_id, created_at desc);
alter table public.ai_calls enable row level security;   -- no policies: service role only

-- Internal helpers are not part of the API.
revoke all on function public.complaint_rate_limit() from public, anon, authenticated;
revoke all on function public.flag_rate_limit() from public, anon, authenticated;

-- 3 ------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;          -- includes views
grant select on public.public_complaints to anon;             -- guest browsing (0016)
grant select on public.public_updates    to anon;
grant insert on public.contact_messages  to anon;             -- Contact us from the sign-in page
revoke all on public.ai_calls from anon, authenticated;

-- ===================== 0018_comments.sql =====================
-- =====================================================================
-- Christ NCR Forum · anonymous comments on public posts.
-- Students see only the commenter's class (course + year), plus an
-- "Author" tag when the post's own author replies. Admins see real names
-- through admin_comments(), and every such look is written to admin_views.
-- Three reports hide a comment until the owner restores or deletes it.
-- =====================================================================

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 2 and 500),
  hidden       boolean not null default false,
  reports      int not null default 0,
  created_at   timestamptz not null default now()
);
create index comments_complaint_idx on public.comments (complaint_id, created_at);
create index comments_author_idx on public.comments (author_id, created_at desc);

create table public.comment_reports (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  reason     text not null check (char_length(reason) between 2 and 300),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comments        enable row level security;
alter table public.comment_reports enable row level security;

-- A comment that is visible and that the caller didn't write (definer, so the
-- policy check doesn't trip over RLS on comments: see 0008).
create or replace function public.comment_reportable(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.comments cm join public.complaints c on c.id = cm.complaint_id
    where cm.id = p_id and not cm.hidden and not c.hidden and not c.is_private
      and cm.author_id <> auth.uid()
  );
$$;
revoke all on function public.comment_reportable(uuid) from public, anon;
grant execute on function public.comment_reportable(uuid) to authenticated;

-- comments: write your own on public, visible posts; delete your own; the
-- owner deletes anything. Reading others' rows goes through the view / RPCs.
create policy "comments select own or admin" on public.comments for select to authenticated
  using (author_id = auth.uid() or public.is_admin());
create policy "comments insert own" on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.complaint_is_public(complaint_id, false));
create policy "comments delete own or owner" on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_owner());

create policy "comment_reports select own or admin" on public.comment_reports for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "comment_reports insert own" on public.comment_reports for insert to authenticated
  with check (user_id = auth.uid() and public.comment_reportable(comment_id));

-- Server-owned fields + rate limit (20 per hour, 100 per day; owner exempt).
create or replace function public.comment_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare last_hour int; last_day int;
begin
  new.created_at := now();
  new.hidden     := false;
  new.reports    := 0;
  new.body       := btrim(new.body);
  if not public.is_owner() then
    select count(*) filter (where created_at > now() - interval '1 hour'),
           count(*) filter (where created_at > now() - interval '1 day')
      into last_hour, last_day
      from public.comments where author_id = new.author_id;
    if last_hour >= 20 then
      raise exception 'You have commented a lot in the last hour. Please wait a little.' using errcode = 'P0001';
    end if;
    if last_day >= 100 then
      raise exception 'You have reached today''s comment limit. Please try again tomorrow.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;
create trigger comments_aa_before_insert
  before insert on public.comments
  for each row execute function public.comment_before_insert();

create or replace function public.comment_report_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from public.comment_reports where user_id = new.user_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many reports in the last hour. Please try again later.' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger comment_reports_aa_before_insert
  before insert on public.comment_reports
  for each row execute function public.comment_report_before_insert();

-- Count reports; hide at 3.
create or replace function public.bump_comment_reports()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.comments
     set reports = reports + 1,
         hidden  = case when reports + 1 >= 3 then true else hidden end
   where id = new.comment_id;
  return null;
end; $$;
create trigger comment_reports_bump
  after insert on public.comment_reports
  for each row execute function public.bump_comment_reports();

-- Live updates: same identity-free broadcast as complaints.
create or replace function public.broadcast_comment_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  if public.complaint_is_public(r.complaint_id, false) then
    perform realtime.send(jsonb_build_object('id', r.complaint_id, 'op', 'COMMENT'), 'complaint', 'feed', true);
  end if;
  return null;
end; $$;
create trigger comments_broadcast
  after insert or update or delete on public.comments
  for each row execute function public.broadcast_comment_change();

revoke all on function public.comment_before_insert() from public, anon, authenticated;
revoke all on function public.comment_report_before_insert() from public, anon, authenticated;
revoke all on function public.bump_comment_reports() from public, anon, authenticated;
revoke all on function public.broadcast_comment_change() from public, anon, authenticated;

-- What students and guests read. No author id, name or email.
create view public.public_comments
with (security_invoker = false) as
select
  cm.id,
  cm.complaint_id,
  cm.body,
  cm.created_at,
  p.course,
  p.grad_year,
  (cm.author_id = c.author_id) as by_op,
  (cm.author_id = auth.uid())  as is_mine,
  exists (select 1 from public.comment_reports r where r.comment_id = cm.id and r.user_id = auth.uid()) as has_reported
from public.comments cm
join public.complaints c on c.id = cm.complaint_id
join public.profiles p on p.id = cm.author_id
where not cm.hidden and not c.hidden and not c.is_private;

revoke all on public.public_comments from public, anon, authenticated;
grant select on public.public_comments to anon, authenticated;

-- Comment count on the feed (new column at the end; everything else as in 0003).
create or replace view public.public_complaints
with (security_invoker = false) as
select
  c.id,
  c.category,
  c.title,
  c.body,
  c.status,
  c.upvotes,
  c.created_at,
  c.updated_at,
  c.acknowledged_at,
  c.resolved_at,
  c.reopened_at,
  p.course,
  p.grad_year,
  exists (select 1 from public.votes v where v.complaint_id = c.id and v.user_id = auth.uid()) as has_voted,
  exists (select 1 from public.flags f where f.complaint_id = c.id and f.user_id = auth.uid()) as has_flagged,
  (c.author_id = auth.uid()) as is_mine,
  c.attention,
  (select count(*) from public.comments cm where cm.complaint_id = c.id and not cm.hidden)::int as comments
from public.complaints c
join public.profiles p on p.id = c.author_id
where c.hidden = false and c.is_private = false;

-- Admin: every comment on a post (hidden ones too) with real names. Logged.
create or replace function public.admin_comments(p_complaint uuid)
returns table (
  id uuid, complaint_id uuid, body text, created_at timestamptz, hidden boolean, reports int, by_op boolean,
  author_id uuid, name text, email text, course text, grad_year int, reporter_kind public.reporter_kind
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  -- One audit row per admin per post per 10 minutes (live refreshes call this often).
  if exists (select 1 from public.comments x where x.complaint_id = p_complaint)
     and not exists (select 1 from public.admin_views v where v.admin_id = auth.uid() and v.complaint_id = p_complaint and v.viewed_at > now() - interval '10 minutes') then
    insert into public.admin_views (admin_id, complaint_id) values (auth.uid(), p_complaint);
  end if;
  return query
    select cm.id, cm.complaint_id, cm.body, cm.created_at, cm.hidden, cm.reports, (cm.author_id = c.author_id),
           cm.author_id, p.name, p.email, p.course, p.grad_year, p.reporter_kind
      from public.comments cm
      join public.complaints c on c.id = cm.complaint_id
      join public.profiles p on p.id = cm.author_id
     where cm.complaint_id = p_complaint
     order by cm.created_at;
end; $$;

-- Admin: the report queue (any comment with at least one report). Logged.
create or replace function public.admin_reported_comments()
returns table (
  id uuid, complaint_id uuid, complaint_title text, body text, created_at timestamptz, hidden boolean, reports int,
  reasons text[], name text, email text, course text, grad_year int, reporter_kind public.reporter_kind
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  insert into public.admin_views (admin_id, complaint_id)
  select distinct auth.uid(), cm.complaint_id from public.comments cm
   where cm.reports > 0
     and not exists (select 1 from public.admin_views v where v.admin_id = auth.uid() and v.complaint_id = cm.complaint_id and v.viewed_at > now() - interval '10 minutes');
  return query
    select cm.id, cm.complaint_id, c.title, cm.body, cm.created_at, cm.hidden, cm.reports,
           array(select r.reason from public.comment_reports r where r.comment_id = cm.id order by r.created_at),
           p.name, p.email, p.course, p.grad_year, p.reporter_kind
      from public.comments cm
      join public.complaints c on c.id = cm.complaint_id
      join public.profiles p on p.id = cm.author_id
     where cm.reports > 0
     order by cm.hidden desc, cm.reports desc, cm.created_at desc;
end; $$;

-- Owner: clear reports and show the comment again.
create or replace function public.admin_restore_comment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'View-only admin: only the super admin can restore comments' using errcode = '42501';
  end if;
  delete from public.comment_reports where comment_id = p_id;
  update public.comments set hidden = false, reports = 0 where id = p_id;
end; $$;

revoke all on function public.admin_comments(uuid) from public, anon;
revoke all on function public.admin_reported_comments() from public, anon;
revoke all on function public.admin_restore_comment(uuid) from public, anon;
grant execute on function public.admin_comments(uuid) to authenticated;
grant execute on function public.admin_reported_comments() to authenticated;
grant execute on function public.admin_restore_comment(uuid) to authenticated;

-- Least privilege, as in 0017.
revoke all on public.comments, public.comment_reports from anon;
revoke truncate, trigger, references on public.comments, public.comment_reports from authenticated;

-- ===================== 0019_christ_ncr.sql =====================
-- =====================================================================
-- Christ NCR Forum · college-specific rules. Run after 0018.
--
-- 1. Students sign in with course subdomains:
--      shlok.ram@bbafth.christuniversity.in
--    so any *.christuniversity.in address (and christuniversity.in itself)
--    is allowed. The one exception is the super admin's Gmail, which is
--    read from public.admins (is_owner), never hard-coded twice.
-- 2. The email gives the name and the course (the subdomain), no year.
-- 3. Students never see a poster's course or year: the public views
--    return null for both (same column shape, so the app is unchanged).
-- 4. No parents/others: every account is the student's own.
-- 5. Shlok and Kaustubh are seeded as view-only admins.
-- =====================================================================

-- 1 ------------------------------------------------------------------
create or replace function public.is_college_email(p_email text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_email, '')) ~ '^[a-z0-9._%+-]+@([a-z0-9-]+\.)*christuniversity\.in$';
$$;

create or replace function public.email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_college_email(p_email)
      or exists (select 1 from public.admins a where a.is_owner and a.email = lower(btrim(p_email)));
$$;
revoke all on function public.email_allowed(text) from public, anon, authenticated;

create or replace function public.enforce_christncr_domain()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  hd text := lower(coalesce(new.raw_user_meta_data -> 'custom_claims' ->> 'hd',
                            new.raw_user_meta_data ->> 'hd', ''));
begin
  if not public.email_allowed(new.email) then
    raise exception 'Only @christuniversity.in accounts can use Christ NCR Forum' using errcode = 'P0001';
  end if;
  -- Workspace accounts carry hd; if it is there it must be a christuniversity.in domain.
  if hd <> '' and hd <> 'christuniversity.in' and hd not like '%.christuniversity.in' then
    raise exception 'Only @christuniversity.in accounts can use Christ NCR Forum' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Only college addresses can be made admins (the owner Gmail is seeded, not granted).
create or replace function public.admin_grant(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(p_email));
begin
  if not public.is_owner() then
    raise exception 'Only the owner can add admins' using errcode = '42501';
  end if;
  if not public.is_college_email(e) then
    raise exception 'Admins must use a @christuniversity.in address' using errcode = 'P0001';
  end if;
  insert into public.admins (email) values (e) on conflict (email) do nothing;
end; $$;

-- 2 ------------------------------------------------------------------
-- first.last@bbafth.christuniversity.in -> ('First Last', 'BBAFTH', null)
-- anything else (staff, owner Gmail)     -> (local part, null, null): Welcome asks for a name
create or replace function public.parse_christncr_email(p_email text,
  out name text, out course text, out grad_year int)
language plpgsql immutable
as $$
declare
  m text[];
begin
  m := regexp_match(lower(p_email), '^([a-z]+)\.([a-z]+)@([a-z0-9-]+)\.christuniversity\.in$');
  if m is not null then
    name      := initcap(m[1]) || ' ' || initcap(m[2]);
    course    := upper(m[3]);
    grad_year := null;
  else
    name      := split_part(p_email, '@', 1);
    course    := null;
    grad_year := null;
  end if;
end;
$$;

-- 3 ------------------------------------------------------------------
create or replace view public.public_complaints
with (security_invoker = false) as
select
  c.id,
  c.category,
  c.title,
  c.body,
  c.status,
  c.upvotes,
  c.created_at,
  c.updated_at,
  c.acknowledged_at,
  c.resolved_at,
  c.reopened_at,
  null::text as course,
  null::int  as grad_year,
  exists (select 1 from public.votes v where v.complaint_id = c.id and v.user_id = auth.uid()) as has_voted,
  exists (select 1 from public.flags f where f.complaint_id = c.id and f.user_id = auth.uid()) as has_flagged,
  (c.author_id = auth.uid()) as is_mine,
  c.attention,
  (select count(*) from public.comments cm where cm.complaint_id = c.id and not cm.hidden)::int as comments
from public.complaints c
where c.hidden = false and c.is_private = false;

create or replace view public.public_comments
with (security_invoker = false) as
select
  cm.id,
  cm.complaint_id,
  cm.body,
  cm.created_at,
  null::text as course,
  null::int  as grad_year,
  (cm.author_id = c.author_id) as by_op,
  (cm.author_id = auth.uid())  as is_mine,
  exists (select 1 from public.comment_reports r where r.comment_id = cm.id and r.user_id = auth.uid()) as has_reported
from public.comments cm
join public.complaints c on c.id = cm.complaint_id
where not cm.hidden and not c.hidden and not c.is_private;

-- 4 ------------------------------------------------------------------
-- The kind argument is kept so the client call shape is unchanged, but
-- every account is recorded as the student.
create or replace function public.complete_onboarding(
  p_nationality text,
  p_reporter_kind public.reporter_kind,
  p_name text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v text := nullif(btrim(p_nationality), '');
  n text := nullif(btrim(coalesce(p_name, '')), '');
  unparsed boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if v is null or char_length(v) < 2 then raise exception 'Nationality is required'; end if;
  if char_length(v) > 60 then raise exception 'Nationality is too long (60 characters max)'; end if;

  select (course is null) into unparsed from public.profiles where id = auth.uid();
  if unparsed and n is null then raise exception 'Please enter your name'; end if;
  if n is not null and (char_length(n) < 2 or char_length(n) > 80) then
    raise exception 'Name must be between 2 and 80 characters';
  end if;

  update public.profiles
     set nationality = v,
         reporter_kind = 'student',
         name = case when unparsed and n is not null then n else name end,
         onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid();
end;
$$;
revoke all on function public.complete_onboarding(text, public.reporter_kind, text) from public, anon;
grant execute on function public.complete_onboarding(text, public.reporter_kind, text) to authenticated;

-- 5 ------------------------------------------------------------------
insert into public.admins (email) values
  ('shlok.ram@bbafth.christuniversity.in'),
  ('kaustubh.dwivedi@bbafth.christuniversity.in')
on conflict (email) do nothing;
-- =====================================================================
-- Christ NCR Forum · admins may use any email address (e.g. a Gmail).
--
-- Students still need a *.christuniversity.in account. The exception is
-- now "anyone on the admins list" instead of "the owner only", so the
-- super admin can hand view-only access to a personal address.
-- Only the owner can add admins (admin_grant checks is_owner()).
-- =====================================================================

create or replace function public.email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_college_email(p_email)
      or exists (select 1 from public.admins a where a.email = lower(btrim(p_email)));
$$;
revoke all on function public.email_allowed(text) from public, anon, authenticated;

create or replace function public.admin_grant(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(p_email));
begin
  if not public.is_owner() then
    raise exception 'Only the owner can add admins' using errcode = '42501';
  end if;
  if e !~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then
    raise exception 'That does not look like an email address' using errcode = 'P0001';
  end if;
  insert into public.admins (email) values (e) on conflict (email) do nothing;
end; $$;

insert into public.admins (email) values ('shlokram5mar@gmail.com')
on conflict (email) do nothing;
-- =====================================================================
-- Christ NCR Forum · security hardening (audit 2026-10-16).
--
-- 1. CRITICAL: public_complaints became a single-table (auto-updatable)
--    view in 0019, and Supabase's default privileges had granted
--    INSERT/UPDATE/DELETE on it to `authenticated`. Because the view runs
--    as its owner (security_invoker = false) that bypassed RLS: any
--    signed-in user could edit or delete any public complaint through it.
--    Views are now read-only for every client role.
-- 2. Least privilege on tables: each client role keeps only the commands
--    it has an RLS policy for. RLS still decides which rows.
-- 3. Trigger / internal helper functions are no longer callable over
--    /rest/v1/rpc by anon or authenticated.
-- 4. search_path pinned on every remaining function.
-- 5. Future objects in `public` are no longer auto-granted to anon /
--    authenticated: every migration must grant explicitly.
-- =====================================================================

-- 1 ------------------------------------------------------------------
do $$
declare v text;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to anon, authenticated', v);
  end loop;
end $$;

-- 2 ------------------------------------------------------------------
do $$
declare t text; r text; cmd text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    foreach r in array array['anon', 'authenticated'] loop
      for cmd in
        select distinct case when p.cmd = 'ALL' then x else p.cmd end
        from pg_policies p
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) x
        where p.schemaname = 'public' and p.tablename = t
          and (r = any (p.roles) or 'public' = any (p.roles))
          and (p.cmd = 'ALL' or p.cmd = x)
      loop
        execute format('grant %s on public.%I to %I', cmd, t, r);
        -- UPDATE/DELETE with a WHERE clause also need SELECT.
        if cmd in ('UPDATE', 'DELETE') then
          execute format('grant select on public.%I to %I', t, r);
        end if;
      end loop;
    end loop;
  end loop;
end $$;

-- Sequences: nothing for anon; signed-in users keep usage (identity inserts).
do $$
declare s text;
begin
  for s in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence public.%I from public, anon', s);
  end loop;
end $$;

-- 3 ------------------------------------------------------------------
-- Trigger functions fire regardless of EXECUTE grants; nobody needs to call them.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Internal helpers: signed-in users need some of them inside RLS policies; guests need none.
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_owner() from public, anon;
revoke all on function public.is_college_email(text) from public, anon;
revoke all on function public.parse_christncr_email(text) from public, anon, authenticated;
revoke all on function public.add_business_days(timestamptz, int) from public, anon, authenticated;
do $$
begin
  if to_regprocedure('public.complaint_is_public(uuid, boolean)') is not null then
    revoke all on function public.complaint_is_public(uuid, boolean) from public, anon;
  end if;
  if to_regprocedure('public.comment_reportable(uuid)') is not null then
    revoke all on function public.comment_reportable(uuid) from public, anon;
  end if;
end $$;

-- Every other non-trigger function in public: guests may not call it.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;

-- 4 ------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;

-- 5 ------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
-- =====================================================================
-- Christ NCR Forum · a "can delete posts" permission for admins.
--
-- Three admin levels now:
--   owner (super admin)  everything
--   admin + can_delete   view everything, and delete complaints
--   admin                view only
-- Only the owner turns can_delete on or off. Deleting stays enforced by
-- the RLS delete policy on complaints, not just by the UI.
-- (0021 removed default grants: everything here is granted explicitly.)
-- =====================================================================

alter table public.admins add column if not exists can_delete boolean not null default false;

-- Owner, or an admin the owner allowed to delete.
create or replace function public.can_delete_posts()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (a.is_owner or a.can_delete)
  );
$$;
revoke all on function public.can_delete_posts() from public, anon;
grant execute on function public.can_delete_posts() to authenticated;

drop policy if exists "complaints delete own or owner" on public.complaints;
drop policy if exists "complaints delete own or moderator" on public.complaints;
create policy "complaints delete own or moderator" on public.complaints for delete to authenticated
  using (author_id = auth.uid() or public.can_delete_posts());

-- Owner-only switch.
create or replace function public.admin_set_delete(p_email text, p_allow boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e text := lower(btrim(p_email));
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change admin permissions' using errcode = '42501';
  end if;
  update public.admins set can_delete = coalesce(p_allow, false) where email = e and not is_owner;
  if not found then
    raise exception 'No such admin' using errcode = 'P0002';
  end if;
end; $$;
revoke all on function public.admin_set_delete(text, boolean) from public, anon;
grant execute on function public.admin_set_delete(text, boolean) to authenticated;

-- The access list now says who can delete.
drop function if exists public.admin_list();
create function public.admin_list()
returns table (email text, added_at timestamptz, name text, course text, grad_year int, signed_in boolean, is_owner boolean, can_delete boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.email, a.added_at, p.name, p.course, p.grad_year, (p.id is not null) as signed_in, a.is_owner, (a.is_owner or a.can_delete)
  from public.admins a
  left join public.profiles p on p.email = a.email
  where public.is_admin()
  order by a.is_owner desc, a.added_at;
$$;
revoke all on function public.admin_list() from public, anon;
grant execute on function public.admin_list() to authenticated;

update public.admins set can_delete = true where email = 'shlokram5mar@gmail.com';
