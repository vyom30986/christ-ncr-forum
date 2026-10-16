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
