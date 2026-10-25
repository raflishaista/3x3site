begin;
create table if not exists public.three_by_three_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.three_by_three_profiles enable row level security;
grant select on public.three_by_three_profiles to anon, authenticated;
grant insert, update, delete on public.three_by_three_profiles to authenticated;
drop policy if exists "Read public profiles" on public.three_by_three_profiles;
create policy "Read public profiles" on public.three_by_three_profiles for select using (true);
drop policy if exists "Create own profile" on public.three_by_three_profiles;
create policy "Create own profile" on public.three_by_three_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own profile" on public.three_by_three_profiles;
create policy "Update own profile" on public.three_by_three_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own profile" on public.three_by_three_profiles;
create policy "Delete own profile" on public.three_by_three_profiles for delete to authenticated using ((select auth.uid()) = user_id);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('three-by-three','three-by-three',true,31457280,array['image/png','image/jpeg','image/webp','image/gif']) on conflict (id) do nothing;
drop policy if exists "Upload own 3x3 images" on storage.objects;
create policy "Upload own 3x3 images" on storage.objects for insert to authenticated with check (bucket_id = 'three-by-three' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Delete own 3x3 images" on storage.objects;
create policy "Delete own 3x3 images" on storage.objects for delete to authenticated using (bucket_id = 'three-by-three' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Read own 3x3 objects" on storage.objects;
create policy "Read own 3x3 objects" on storage.objects for select to authenticated using (bucket_id = 'three-by-three' and (storage.foldername(name))[1] = (select auth.uid())::text);
notify pgrst, 'reload schema';
commit;
