-- CU C/S · "Contact us" from the sign-in page.
-- Anyone (signed in or not) can send a short message, max 200 words.
-- Only admins can read or delete them. One-way: there is no reply.

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  contact    text check (contact is null or char_length(contact) <= 120),
  message    text not null check (
               char_length(btrim(message)) between 5 and 2000
               and coalesce(array_length(regexp_split_to_array(btrim(message), '\s+'), 1), 0) <= 200
             ),
  user_id    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

create policy "contact insert anyone" on public.contact_messages for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create policy "contact select admin" on public.contact_messages for select to authenticated
  using (public.is_admin());
create policy "contact delete admin" on public.contact_messages for delete to authenticated
  using (public.is_admin());

grant insert on public.contact_messages to anon, authenticated;
grant select, delete on public.contact_messages to authenticated;

-- Basic flood guard: at most 20 messages per minute across everyone.
create or replace function public.contact_rate_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many messages right now. Please try again in a minute.' using errcode = 'P0001';
  end if;
  new.name := btrim(new.name);
  new.contact := nullif(btrim(coalesce(new.contact, '')), '');
  new.message := btrim(new.message);
  new.created_at := now();
  return new;
end;
$$;
create trigger contact_messages_rate_limit
  before insert on public.contact_messages
  for each row execute function public.contact_rate_limit();
