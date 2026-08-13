-- ============================================================================
-- Student Attachments — one-time setup
-- ============================================================================
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query)
-- to enable the "Attachments" section on student profiles. Safe to re-run —
-- it drops and recreates its own policies, and skips creating the bucket if
-- it already exists.
--
-- What this does:
--   1. Creates a PRIVATE storage bucket called "student-attachments". It's
--      private (not public) because these are photos of minors — files are
--      only ever served through short-lived signed URLs generated for
--      logged-in team members, never a public link.
--   2. Adds storage policies so any authenticated team member (anyone with
--      a row in `profiles`, same as the rest of the app) can view, upload,
--      and delete attachments. There's no separate admin/staff split here
--      to match how routine student-record edits already work.
--   3. Restricts uploads to common image types and 10MB per file.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-attachments',
  'student-attachments',
  false,
  10485760, -- 10MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists "Staff can view student attachments" on storage.objects;
create policy "Staff can view student attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'student-attachments'
  and exists (select 1 from public.profiles where id = auth.uid())
);

drop policy if exists "Staff can upload student attachments" on storage.objects;
create policy "Staff can upload student attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'student-attachments'
  and exists (select 1 from public.profiles where id = auth.uid())
);

drop policy if exists "Staff can delete student attachments" on storage.objects;
create policy "Staff can delete student attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'student-attachments'
  and exists (select 1 from public.profiles where id = auth.uid())
);
