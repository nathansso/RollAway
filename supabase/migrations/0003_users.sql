-- Phase 2c — persistent users: Supabase Auth (email magic link) + profiles +
-- menus. RLS: users read/write only their own rows. The frontend uses the anon
-- key for profile CRUD; the FastAPI service uses the service key to write
-- menu-extraction results.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  vendor_type text check (vendor_type in ('truck','trailer','pushcart_cooking','pushcart_nocook')),
  max_travel_minutes int,
  travel_mode text,
  home_lat double precision,
  home_lng double precision,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists menus (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  storage_path text,                 -- object in the private 'menus' bucket
  items jsonb,                       -- menu_extract output items
  keywords jsonb,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table menus enable row level security;

create policy profiles_select_own on profiles for select using (auth.uid() = id);
create policy profiles_insert_own on profiles for insert with check (auth.uid() = id);
create policy profiles_update_own on profiles for update using (auth.uid() = id);
create policy profiles_delete_own on profiles for delete using (auth.uid() = id);

create policy menus_select_own on menus for select using (auth.uid() = user_id);
create policy menus_insert_own on menus for insert with check (auth.uid() = user_id);
create policy menus_update_own on menus for update using (auth.uid() = user_id);
create policy menus_delete_own on menus for delete using (auth.uid() = user_id);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Private storage bucket for uploaded menu PDFs/images (Phase 2a.4). Objects
-- are keyed '<user_id>/<filename>' so the per-user policies below apply; the
-- FastAPI service key bypasses RLS for anonymous-session uploads.
insert into storage.buckets (id, name, public)
values ('menus', 'menus', false)
on conflict (id) do nothing;

create policy menus_storage_read on storage.objects for select
  using (bucket_id = 'menus' and auth.uid()::text = (storage.foldername(name))[1]);
create policy menus_storage_write on storage.objects for insert
  with check (bucket_id = 'menus' and auth.uid()::text = (storage.foldername(name))[1]);
