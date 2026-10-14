-- =====================================================================
-- CU C/S · "Attention needed": any post with more than 50 upvotes.
-- Stored generated column, so it is always in step with the vote count
-- and can be filtered / indexed directly.
-- =====================================================================

alter table public.complaints
  add column attention boolean generated always as (upvotes > 50) stored;

create index complaints_attention_idx on public.complaints (attention, upvotes desc)
  where attention = true;

-- Expose it on the student view (adding a column at the end is allowed by
-- create or replace view).
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
  p.course,
  p.grad_year,
  exists (select 1 from public.votes v where v.complaint_id = c.id and v.user_id = auth.uid()) as has_voted,
  exists (select 1 from public.flags f where f.complaint_id = c.id and f.user_id = auth.uid()) as has_flagged,
  (c.author_id = auth.uid()) as is_mine,
  c.attention
from public.complaints c
join public.profiles p on p.id = c.author_id
where c.hidden = false and c.is_private = false;

revoke all on public.public_complaints from anon, public;
grant select on public.public_complaints to authenticated;
