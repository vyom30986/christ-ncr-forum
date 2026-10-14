-- =====================================================================
-- Christ NCR Forum · anonymous comments on public posts.
-- Students see only the commenter's class (course + year), plus an
-- "Author" tag when the post's own author replies. Admins see real names
-- through admin_comments(), and every such look is written to admin_views.
-- Three reports hide a comment until the owner restores or deletes it.
-- =====================================================================

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 2 and 500),
  hidden       boolean not null default false,
  reports      int not null default 0,
  created_at   timestamptz not null default now()
);
create index comments_complaint_idx on public.comments (complaint_id, created_at);
create index comments_author_idx on public.comments (author_id, created_at desc);

create table public.comment_reports (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  reason     text not null check (char_length(reason) between 2 and 300),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comments        enable row level security;
alter table public.comment_reports enable row level security;

-- A comment that is visible and that the caller didn't write (definer, so the
-- policy check doesn't trip over RLS on comments: see 0008).
create or replace function public.comment_reportable(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.comments cm join public.complaints c on c.id = cm.complaint_id
    where cm.id = p_id and not cm.hidden and not c.hidden and not c.is_private
      and cm.author_id <> auth.uid()
  );
$$;
revoke all on function public.comment_reportable(uuid) from public, anon;
grant execute on function public.comment_reportable(uuid) to authenticated;

-- comments: write your own on public, visible posts; delete your own; the
-- owner deletes anything. Reading others' rows goes through the view / RPCs.
create policy "comments select own or admin" on public.comments for select to authenticated
  using (author_id = auth.uid() or public.is_admin());
create policy "comments insert own" on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.complaint_is_public(complaint_id, false));
create policy "comments delete own or owner" on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_owner());

create policy "comment_reports select own or admin" on public.comment_reports for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "comment_reports insert own" on public.comment_reports for insert to authenticated
  with check (user_id = auth.uid() and public.comment_reportable(comment_id));

-- Server-owned fields + rate limit (20 per hour, 100 per day; owner exempt).
create or replace function public.comment_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare last_hour int; last_day int;
begin
  new.created_at := now();
  new.hidden     := false;
  new.reports    := 0;
  new.body       := btrim(new.body);
  if not public.is_owner() then
    select count(*) filter (where created_at > now() - interval '1 hour'),
           count(*) filter (where created_at > now() - interval '1 day')
      into last_hour, last_day
      from public.comments where author_id = new.author_id;
    if last_hour >= 20 then
      raise exception 'You have commented a lot in the last hour. Please wait a little.' using errcode = 'P0001';
    end if;
    if last_day >= 100 then
      raise exception 'You have reached today''s comment limit. Please try again tomorrow.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;
create trigger comments_aa_before_insert
  before insert on public.comments
  for each row execute function public.comment_before_insert();

create or replace function public.comment_report_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from public.comment_reports where user_id = new.user_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many reports in the last hour. Please try again later.' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger comment_reports_aa_before_insert
  before insert on public.comment_reports
  for each row execute function public.comment_report_before_insert();

-- Count reports; hide at 3.
create or replace function public.bump_comment_reports()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.comments
     set reports = reports + 1,
         hidden  = case when reports + 1 >= 3 then true else hidden end
   where id = new.comment_id;
  return null;
end; $$;
create trigger comment_reports_bump
  after insert on public.comment_reports
  for each row execute function public.bump_comment_reports();

-- Live updates: same identity-free broadcast as complaints.
create or replace function public.broadcast_comment_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  if public.complaint_is_public(r.complaint_id, false) then
    perform realtime.send(jsonb_build_object('id', r.complaint_id, 'op', 'COMMENT'), 'complaint', 'feed', true);
  end if;
  return null;
end; $$;
create trigger comments_broadcast
  after insert or update or delete on public.comments
  for each row execute function public.broadcast_comment_change();

revoke all on function public.comment_before_insert() from public, anon, authenticated;
revoke all on function public.comment_report_before_insert() from public, anon, authenticated;
revoke all on function public.bump_comment_reports() from public, anon, authenticated;
revoke all on function public.broadcast_comment_change() from public, anon, authenticated;

-- What students and guests read. No author id, name or email.
create view public.public_comments
with (security_invoker = false) as
select
  cm.id,
  cm.complaint_id,
  cm.body,
  cm.created_at,
  p.course,
  p.grad_year,
  (cm.author_id = c.author_id) as by_op,
  (cm.author_id = auth.uid())  as is_mine,
  exists (select 1 from public.comment_reports r where r.comment_id = cm.id and r.user_id = auth.uid()) as has_reported
from public.comments cm
join public.complaints c on c.id = cm.complaint_id
join public.profiles p on p.id = cm.author_id
where not cm.hidden and not c.hidden and not c.is_private;

revoke all on public.public_comments from public, anon, authenticated;
grant select on public.public_comments to anon, authenticated;

-- Comment count on the feed (new column at the end; everything else as in 0003).
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
  c.attention,
  (select count(*) from public.comments cm where cm.complaint_id = c.id and not cm.hidden)::int as comments
from public.complaints c
join public.profiles p on p.id = c.author_id
where c.hidden = false and c.is_private = false;

-- Admin: every comment on a post (hidden ones too) with real names. Logged.
create or replace function public.admin_comments(p_complaint uuid)
returns table (
  id uuid, complaint_id uuid, body text, created_at timestamptz, hidden boolean, reports int, by_op boolean,
  author_id uuid, name text, email text, course text, grad_year int, reporter_kind public.reporter_kind
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  -- One audit row per admin per post per 10 minutes (live refreshes call this often).
  if exists (select 1 from public.comments x where x.complaint_id = p_complaint)
     and not exists (select 1 from public.admin_views v where v.admin_id = auth.uid() and v.complaint_id = p_complaint and v.viewed_at > now() - interval '10 minutes') then
    insert into public.admin_views (admin_id, complaint_id) values (auth.uid(), p_complaint);
  end if;
  return query
    select cm.id, cm.complaint_id, cm.body, cm.created_at, cm.hidden, cm.reports, (cm.author_id = c.author_id),
           cm.author_id, p.name, p.email, p.course, p.grad_year, p.reporter_kind
      from public.comments cm
      join public.complaints c on c.id = cm.complaint_id
      join public.profiles p on p.id = cm.author_id
     where cm.complaint_id = p_complaint
     order by cm.created_at;
end; $$;

-- Admin: the report queue (any comment with at least one report). Logged.
create or replace function public.admin_reported_comments()
returns table (
  id uuid, complaint_id uuid, complaint_title text, body text, created_at timestamptz, hidden boolean, reports int,
  reasons text[], name text, email text, course text, grad_year int, reporter_kind public.reporter_kind
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  insert into public.admin_views (admin_id, complaint_id)
  select distinct auth.uid(), cm.complaint_id from public.comments cm
   where cm.reports > 0
     and not exists (select 1 from public.admin_views v where v.admin_id = auth.uid() and v.complaint_id = cm.complaint_id and v.viewed_at > now() - interval '10 minutes');
  return query
    select cm.id, cm.complaint_id, c.title, cm.body, cm.created_at, cm.hidden, cm.reports,
           array(select r.reason from public.comment_reports r where r.comment_id = cm.id order by r.created_at),
           p.name, p.email, p.course, p.grad_year, p.reporter_kind
      from public.comments cm
      join public.complaints c on c.id = cm.complaint_id
      join public.profiles p on p.id = cm.author_id
     where cm.reports > 0
     order by cm.hidden desc, cm.reports desc, cm.created_at desc;
end; $$;

-- Owner: clear reports and show the comment again.
create or replace function public.admin_restore_comment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'View-only admin: only the super admin can restore comments' using errcode = '42501';
  end if;
  delete from public.comment_reports where comment_id = p_id;
  update public.comments set hidden = false, reports = 0 where id = p_id;
end; $$;

revoke all on function public.admin_comments(uuid) from public, anon;
revoke all on function public.admin_reported_comments() from public, anon;
revoke all on function public.admin_restore_comment(uuid) from public, anon;
grant execute on function public.admin_comments(uuid) to authenticated;
grant execute on function public.admin_reported_comments() to authenticated;
grant execute on function public.admin_restore_comment(uuid) to authenticated;

-- Least privilege, as in 0017.
revoke all on public.comments, public.comment_reports from anon;
revoke truncate, trigger, references on public.comments, public.comment_reports from authenticated;
