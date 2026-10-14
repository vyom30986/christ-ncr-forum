-- =====================================================================
-- CU C/S · follow-up check-ins and escalation
--
-- 3 business days after a complaint is posted, the author is asked
-- "Has this been solved?"
--   Yes                      -> complaint is closed as resolved
--   No, fix promised in N days (1-7) -> ask again after N days
--   No, nothing promised     -> escalate: admins + the people in charge
--                               are emailed; ask again in 3 business days
-- =====================================================================

alter table public.complaints
  add column checkin_due_at      timestamptz,
  add column checkin_answered_at timestamptz,
  add column promised_days       int check (promised_days between 1 and 7),
  add column escalated_at        timestamptz,
  add column escalations         int not null default 0;

create index complaints_checkin_idx on public.complaints (author_id, checkin_due_at)
  where checkin_due_at is not null;

-- Audit + webhook source for escalation emails.
create table public.escalations (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now()
);
alter table public.escalations enable row level security;
create policy "escalations select admin" on public.escalations for select to authenticated using (public.is_admin());

-- Skip Saturdays and Sundays.
create or replace function public.add_business_days(p_from timestamptz, p_days int)
returns timestamptz language plpgsql immutable as $$
declare
  d timestamptz := p_from;
  n int := 0;
begin
  while n < p_days loop
    d := d + interval '1 day';
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end; $$;

-- Schedule the first check-in when a complaint is posted.
create or replace function public.schedule_first_checkin()
returns trigger language plpgsql as $$
begin
  new.checkin_due_at := public.add_business_days(new.created_at, 3);
  return new;
end; $$;
create trigger complaints_schedule_checkin
  before insert on public.complaints
  for each row execute function public.schedule_first_checkin();

-- Stop asking once an admin resolves or rejects; restart when reopened.
create or replace function public.sync_checkin_on_status()
returns trigger language plpgsql as $$
begin
  if new.status in ('resolved', 'rejected') then
    new.checkin_due_at := null;
  elsif old.status in ('resolved', 'rejected') and new.status not in ('resolved', 'rejected') then
    new.checkin_due_at := public.add_business_days(now(), 3);
    new.promised_days := null;
  end if;
  return new;
end; $$;
create trigger complaints_sync_checkin
  before update of status on public.complaints
  for each row execute function public.sync_checkin_on_status();

-- The author answers the pop-up.
create or replace function public.answer_checkin(p_id uuid, p_solved boolean, p_promised_days int default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints;
begin
  select * into c from public.complaints where id = p_id for update;
  if c.id is null or c.author_id <> auth.uid() then
    raise exception 'Not your complaint' using errcode = '42501';
  end if;
  if c.status in ('resolved', 'rejected') then
    raise exception 'This complaint is already closed' using errcode = 'P0001';
  end if;

  if p_solved then
    update public.complaints
       set status = 'resolved', resolved_at = now(),
           checkin_answered_at = now(), checkin_due_at = null, promised_days = null
     where id = p_id;

  elsif p_promised_days is not null then
    if p_promised_days not between 1 and 7 then
      raise exception 'Promised days must be between 1 and 7' using errcode = 'P0001';
    end if;
    update public.complaints
       set checkin_answered_at = now(),
           promised_days = p_promised_days,
           checkin_due_at = now() + make_interval(days => p_promised_days)
     where id = p_id;

  else
    update public.complaints
       set checkin_answered_at = now(),
           promised_days = null,
           escalated_at = now(),
           escalations = escalations + 1,
           checkin_due_at = public.add_business_days(now(), 3)
     where id = p_id;
    insert into public.escalations (complaint_id, author_id) values (p_id, auth.uid());
  end if;
end; $$;

revoke all on function public.answer_checkin(uuid, boolean, int) from public, anon;
grant execute on function public.answer_checkin(uuid, boolean, int) to authenticated;

-- Tell every signed-in client something changed (admin list shows the badge).
create or replace function public.broadcast_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(jsonb_build_object('id', new.complaint_id, 'op', 'ESCALATE'), 'complaint', 'feed', true);
  return null;
end; $$;
create trigger escalations_broadcast
  after insert on public.escalations
  for each row execute function public.broadcast_escalation();
