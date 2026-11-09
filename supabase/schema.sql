-- Nosotros v2: esquema completo (ya aplicado al proyecto "nosotros-chat" de Supabase).
-- Seguridad: solo los usuarios listados en public.members pueden leer o escribir algo.

create extension if not exists pgcrypto;

-- ───────────── Miembros (solo ustedes dos) ─────────────
create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  status_emoji text check (status_emoji is null or char_length(status_emoji) <= 16),
  status_text text check (status_text is null or char_length(status_text) <= 80),
  status_until timestamptz
);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

alter table public.members enable row level security;
drop policy if exists "members_select" on public.members;
create policy "members_select" on public.members
  for select to authenticated using (public.is_member());

-- Tu estado ("En obra · te contesto a las 7"). Solo puedes cambiar el tuyo.
create or replace function public.set_status(p_emoji text, p_text text, p_until timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update public.members
     set status_emoji = nullif(btrim(p_emoji), ''),
         status_text  = nullif(btrim(p_text), ''),
         status_until = p_until
   where user_id = auth.uid();
$$;

revoke all on function public.set_status(text, text, timestamptz) from public, anon;
grant execute on function public.set_status(text, text, timestamptz) to authenticated;

-- ───────────── Mensajes ─────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text', 'image', 'audio', 'ping')),
  body text check (body is null or char_length(body) <= 4000),
  media_path text,
  media_mime text,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 600000),
  waveform jsonb check (
    waveform is null or (jsonb_typeof(waveform) = 'array' and jsonb_array_length(waveform) <= 80)
  ),
  reply_to uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint messages_shape check (
    (kind = 'text' and body is not null and char_length(btrim(body)) > 0)
    or (kind in ('image', 'audio') and media_path is not null)
    or kind = 'ping'
  )
);

create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists messages_reply_to_idx on public.messages (reply_to);

alter table public.messages enable row level security;

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select to authenticated using (public.is_member());

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (public.is_member() and sender_id = auth.uid());

-- Borrar para ambos: solo tus propios mensajes
drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete to authenticated
  using (public.is_member() and sender_id = auth.uid());

-- No hay policy de update: lo único que se puede cambiar es read_at, vía esta función.
create or replace function public.mark_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages
     set read_at = now()
   where read_at is null
     and sender_id <> auth.uid()
     and public.is_member();
$$;

revoke all on function public.mark_read() from public, anon;
grant execute on function public.mark_read() to authenticated;

-- ───────────── Reacciones ─────────────
create table if not exists public.reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.reactions enable row level security;

drop policy if exists "reactions_select" on public.reactions;
create policy "reactions_select" on public.reactions
  for select to authenticated using (public.is_member());

drop policy if exists "reactions_insert" on public.reactions;
create policy "reactions_insert" on public.reactions
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());

drop policy if exists "reactions_update" on public.reactions;
create policy "reactions_update" on public.reactions
  for update to authenticated
  using (public.is_member() and user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "reactions_delete" on public.reactions;
create policy "reactions_delete" on public.reactions
  for delete to authenticated using (public.is_member() and user_id = auth.uid());

-- Tiempo real: mensajes, reacciones y estados
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.reactions;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.members;
exception when duplicate_object then null;
end $$;

-- ───────────── Suscripciones push ─────────────
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_select" on public.push_subscriptions;
create policy "push_select" on public.push_subscriptions
  for select to authenticated using (public.is_member());

drop policy if exists "push_insert" on public.push_subscriptions;
create policy "push_insert" on public.push_subscriptions
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());

drop policy if exists "push_update" on public.push_subscriptions;
create policy "push_update" on public.push_subscriptions
  for update to authenticated
  using (public.is_member() and user_id = auth.uid())
  with check (user_id = auth.uid());

-- Cualquiera de los dos puede limpiar suscripciones muertas
drop policy if exists "push_delete" on public.push_subscriptions;
create policy "push_delete" on public.push_subscriptions
  for delete to authenticated using (public.is_member());

-- ───────────── Archivos (fotos y notas de voz) ─────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 15728640)
on conflict (id) do nothing;

drop policy if exists "media_select" on storage.objects;
create policy "media_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and public.is_member());

drop policy if exists "media_insert" on storage.objects;
create policy "media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.is_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_delete_own" on storage.objects;
create policy "media_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and public.is_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ───────────── Después de correr esto ─────────────
-- 1) Crea los 2 usuarios (correo + contraseña, confirmados).
-- 2) Desactiva "Allow new users to sign up" en Authentication.
-- 3) Registra a los dos en public.members con su nombre.
