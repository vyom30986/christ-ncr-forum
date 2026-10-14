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
