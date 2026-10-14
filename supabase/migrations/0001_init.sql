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
