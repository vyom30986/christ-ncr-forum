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
