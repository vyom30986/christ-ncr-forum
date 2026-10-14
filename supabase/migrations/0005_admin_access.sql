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
