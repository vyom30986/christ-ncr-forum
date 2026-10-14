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
