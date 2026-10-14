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
