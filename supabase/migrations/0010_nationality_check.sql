-- Friendlier error than the raw check-constraint message.
create or replace function public.set_nationality(p_nationality text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(p_nationality), '');
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if v is not null and char_length(v) < 2 then
    raise exception 'Nationality needs at least 2 characters' using errcode = 'P0001';
  end if;
  if v is not null and char_length(v) > 60 then
    raise exception 'Nationality is too long (60 characters max)' using errcode = 'P0001';
  end if;
  update public.profiles set nationality = v where id = auth.uid();
end; $$;
