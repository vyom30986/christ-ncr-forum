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
