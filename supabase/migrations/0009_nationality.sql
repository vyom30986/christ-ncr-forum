-- =====================================================================
-- CU C/S · nationality on the profile (set by the student, shown to
-- admins; never exposed to other students).
-- =====================================================================
alter table public.profiles add column nationality text check (char_length(nationality) between 2 and 60);

-- Students may change only their nationality, nothing else on the profile.
create or replace function public.set_nationality(p_nationality text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(p_nationality), '');
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.profiles set nationality = v where id = auth.uid();
end; $$;
revoke all on function public.set_nationality(text) from public, anon;
grant execute on function public.set_nationality(text) to authenticated;

-- Admin directory shows it too.
drop function public.admin_user_stats();
create or replace function public.admin_user_stats()
returns table (
  id uuid, email text, name text, course text, grad_year int, nationality text, role public.user_role, created_at timestamptz,
  complaints bigint, open_complaints bigint, resolved_complaints bigint, private_complaints bigint, hidden_complaints bigint,
  upvotes_received bigint, votes_cast bigint, flags_cast bigint, flags_received bigint, escalations bigint,
  last_complaint_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.email, p.name, p.course, p.grad_year, p.nationality, p.role, p.created_at,
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
