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
