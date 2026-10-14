-- CU C/S · staff and other non-standard @christuniversity.in addresses cannot be
-- parsed into name/course/year, so the first-visit screen asks for a name.
-- The name may only be set this way while the profile is unparsed
-- (course is null); student profiles keep the name derived from the email.

drop function if exists public.complete_onboarding(text, public.reporter_kind);

create or replace function public.complete_onboarding(
  p_nationality text,
  p_reporter_kind public.reporter_kind,
  p_name text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v text := nullif(btrim(p_nationality), '');
  n text := nullif(btrim(coalesce(p_name, '')), '');
  unparsed boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if v is null or char_length(v) < 2 then raise exception 'Nationality is required'; end if;
  if char_length(v) > 60 then raise exception 'Nationality is too long (60 characters max)'; end if;

  select (course is null) into unparsed from public.profiles where id = auth.uid();
  if unparsed and n is null then raise exception 'Please enter your name'; end if;
  if n is not null and (char_length(n) < 2 or char_length(n) > 80) then
    raise exception 'Name must be between 2 and 80 characters';
  end if;

  update public.profiles
     set nationality = v,
         reporter_kind = p_reporter_kind,
         name = case when unparsed and n is not null then n else name end,
         onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid();
end;
$$;
revoke all on function public.complete_onboarding(text, public.reporter_kind, text) from public, anon;
grant execute on function public.complete_onboarding(text, public.reporter_kind, text) to authenticated;
