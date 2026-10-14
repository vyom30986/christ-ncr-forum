-- =====================================================================
-- Database webhooks -> notify-status Edge Function.
-- Replace the two placeholders, then run once in the SQL editor (or
-- create the same two webhooks in Dashboard > Database > Webhooks).
--
--   updates     INSERT  -> status change / official reply emails
--   escalations INSERT  -> "nothing promised" escalation emails
-- =====================================================================
create extension if not exists pg_net;

create or replace trigger notify_status_change
  after insert on public.updates
  for each row
  execute function supabase_functions.http_request(
    'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-status',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}',
    '{}',
    '5000'
  );

create or replace trigger notify_escalation
  after insert on public.escalations
  for each row
  execute function supabase_functions.http_request(
    'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-status',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}',
    '{}',
    '5000'
  );
