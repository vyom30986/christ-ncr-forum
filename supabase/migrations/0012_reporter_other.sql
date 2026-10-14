-- CU C/S · a third reporter kind: "other" (a relative, guardian, friend
-- or anyone else using the student's account). Admins see
-- "Other (via <student name>)".
alter type public.reporter_kind add value if not exists 'other';
