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
