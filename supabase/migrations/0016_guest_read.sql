-- =====================================================================
-- Christ NCR Forum · guests can read the public board without signing in.
-- Only the two cohort-level views are opened to the anon role: no names,
-- no emails, no author ids, no private or hidden posts. For a guest
-- auth.uid() is null, so has_voted / has_flagged are false and is_mine
-- is null. Posting, voting and flagging still need a signed-in account.
-- =====================================================================

grant select on public.public_complaints to anon;
grant select on public.public_updates    to anon;
