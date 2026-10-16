-- =====================================================================
-- Christ NCR Forum · security hardening (audit 2026-10-16).
--
-- 1. CRITICAL: public_complaints became a single-table (auto-updatable)
--    view in 0019, and Supabase's default privileges had granted
--    INSERT/UPDATE/DELETE on it to `authenticated`. Because the view runs
--    as its owner (security_invoker = false) that bypassed RLS: any
--    signed-in user could edit or delete any public complaint through it.
--    Views are now read-only for every client role.
-- 2. Least privilege on tables: each client role keeps only the commands
--    it has an RLS policy for. RLS still decides which rows.
-- 3. Trigger / internal helper functions are no longer callable over
--    /rest/v1/rpc by anon or authenticated.
-- 4. search_path pinned on every remaining function.
-- 5. Future objects in `public` are no longer auto-granted to anon /
--    authenticated: every migration must grant explicitly.
-- =====================================================================

-- 1 ------------------------------------------------------------------
do $$
declare v text;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to anon, authenticated', v);
  end loop;
end $$;

-- 2 ------------------------------------------------------------------
do $$
declare t text; r text; cmd text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    foreach r in array array['anon', 'authenticated'] loop
      for cmd in
        select distinct case when p.cmd = 'ALL' then x else p.cmd end
        from pg_policies p
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) x
        where p.schemaname = 'public' and p.tablename = t
          and (r = any (p.roles) or 'public' = any (p.roles))
          and (p.cmd = 'ALL' or p.cmd = x)
      loop
        execute format('grant %s on public.%I to %I', cmd, t, r);
        -- UPDATE/DELETE with a WHERE clause also need SELECT.
        if cmd in ('UPDATE', 'DELETE') then
          execute format('grant select on public.%I to %I', t, r);
        end if;
      end loop;
    end loop;
  end loop;
end $$;

-- Sequences: nothing for anon; signed-in users keep usage (identity inserts).
do $$
declare s text;
begin
  for s in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence public.%I from public, anon', s);
  end loop;
end $$;

-- 3 ------------------------------------------------------------------
-- Trigger functions fire regardless of EXECUTE grants; nobody needs to call them.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Internal helpers: signed-in users need some of them inside RLS policies; guests need none.
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_owner() from public, anon;
revoke all on function public.is_college_email(text) from public, anon;
revoke all on function public.parse_christncr_email(text) from public, anon, authenticated;
revoke all on function public.add_business_days(timestamptz, int) from public, anon, authenticated;
do $$
begin
  if to_regprocedure('public.complaint_is_public(uuid, boolean)') is not null then
    revoke all on function public.complaint_is_public(uuid, boolean) from public, anon;
  end if;
  if to_regprocedure('public.comment_reportable(uuid)') is not null then
    revoke all on function public.comment_reportable(uuid) from public, anon;
  end if;
end $$;

-- Every other non-trigger function in public: guests may not call it.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;

-- 4 ------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;

-- 5 ------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
