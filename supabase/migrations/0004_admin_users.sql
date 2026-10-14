-- =====================================================================
-- CU C/S · admin user directory
-- Admins can read every vote (for per-user activity) and get per-user
-- aggregates in one call.
-- =====================================================================

create policy "votes select admin" on public.votes for select to authenticated using (public.is_admin());

create or replace function public.admin_user_stats()
returns table (
  id uuid, email text, name text, course text, grad_year int, role public.user_role, created_at timestamptz,
  complaints bigint, open_complaints bigint, resolved_complaints bigint, private_complaints bigint, hidden_complaints bigint,
  upvotes_received bigint, votes_cast bigint, flags_cast bigint, flags_received bigint, escalations bigint,
  last_complaint_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.email, p.name, p.course, p.grad_year, p.role, p.created_at,
    count(c.id)                                                        as complaints,
    count(c.id) filter (where c.status in ('open','acknowledged','in_progress')) as open_complaints,
    count(c.id) filter (where c.status = 'resolved')                   as resolved_complaints,
    count(c.id) filter (where c.is_private)                            as private_complaints,
    count(c.id) filter (where c.hidden)                                as hidden_complaints,
    coalesce(sum(c.upvotes), 0)                                        as upvotes_received,
    (select count(*) from public.votes v where v.user_id = p.id)       as votes_cast,
    (select count(*) from public.flags f where f.user_id = p.id)       as flags_cast,
    coalesce(sum(c.flags), 0)                                          as flags_received,
    coalesce(sum(c.escalations), 0)                                    as escalations,
    max(c.created_at)                                                  as last_complaint_at
  from public.profiles p
  left join public.complaints c on c.author_id = p.id
  where public.is_admin()
  group by p.id
  order by complaints desc, upvotes_received desc, p.name;
$$;

revoke all on function public.admin_user_stats() from public, anon;
grant execute on function public.admin_user_stats() to authenticated;
