-- =====================================================================
-- CU C/S · the reporter chooses how many working days to give before
-- the follow-up check-in (and therefore before escalation can start).
-- =====================================================================

alter table public.complaints
  add column grace_days int not null default 3 check (grace_days between 1 and 14);

-- First check-in uses the chosen grace period instead of a fixed 3 days.
create or replace function public.schedule_first_checkin()
returns trigger language plpgsql as $$
begin
  new.checkin_due_at := public.add_business_days(new.created_at, coalesce(new.grace_days, 3));
  return new;
end; $$;

-- Reopening restarts the clock with the same grace period.
create or replace function public.sync_checkin_on_status()
returns trigger language plpgsql as $$
begin
  if new.status in ('resolved', 'rejected') then
    new.checkin_due_at := null;
  elsif old.status in ('resolved', 'rejected') and new.status not in ('resolved', 'rejected') then
    new.checkin_due_at := public.add_business_days(now(), coalesce(new.grace_days, 3));
    new.promised_days := null;
  end if;
  return new;
end; $$;
