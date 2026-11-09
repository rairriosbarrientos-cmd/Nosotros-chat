-- v5: chats separados (conversaciones). Ya aplicado en el proyecto en vivo.
-- Cada chat es una conversación con sus miembros; mensajes, reacciones, estados, fotos y pushes
-- solo se ven entre personas que comparten conversación. Para crear un chat nuevo (como service/SQL editor):
--   insert into members(user_id, display_name) values ('<uuid del usuario>', 'Nombre');
--   with c as (insert into conversations default values returning id)
--   insert into conversation_members select c.id, u from c, unnest(array['<uuid A>','<uuid B>']::uuid[]) u;

create table if not exists public.conversations (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now());
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (conversation_id, user_id));
create index if not exists conv_members_user_idx on public.conversation_members (user_id);
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;

create or replace function public.is_conv_member(cid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id = cid and user_id = auth.uid()); $$;
create or replace function public.is_peer(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select uid = auth.uid() or exists (select 1 from public.conversation_members a join public.conversation_members b on a.conversation_id = b.conversation_id where a.user_id = auth.uid() and b.user_id = uid); $$;
revoke all on function public.is_conv_member(uuid), public.is_peer(uuid) from public, anon;
grant execute on function public.is_conv_member(uuid), public.is_peer(uuid) to authenticated;

create policy conv_select on public.conversations for select to authenticated using (public.is_conv_member(id));
create policy conv_members_select on public.conversation_members for select to authenticated using (user_id = auth.uid() or public.is_conv_member(conversation_id));

-- messages.conversation_id y scheduled_messages.conversation_id (not null; en producción se rellenaron con la conversación principal)
alter table public.messages add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.scheduled_messages add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at desc);
create index if not exists messages_media_idx on public.messages (media_path) where media_path is not null;
create index if not exists stories_media_idx on public.stories (media_path) where media_path is not null;
create index if not exists members_avatar_idx on public.members (avatar_path) where avatar_path is not null;

drop policy if exists messages_select on public.messages; drop policy if exists messages_insert on public.messages; drop policy if exists messages_delete_own on public.messages;
create policy messages_select on public.messages for select to authenticated using (public.is_conv_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_conv_member(conversation_id));
create policy messages_delete_own on public.messages for delete to authenticated using (sender_id = auth.uid() and public.is_conv_member(conversation_id));

drop policy if exists sched_insert on public.scheduled_messages;
create policy sched_insert on public.scheduled_messages for insert to authenticated with check (sender_id = auth.uid() and public.is_member() and status = 'pending' and public.is_conv_member(conversation_id));

drop policy if exists reactions_select on public.reactions; drop policy if exists reactions_insert on public.reactions; drop policy if exists reactions_update on public.reactions; drop policy if exists reactions_delete on public.reactions;
create policy reactions_select on public.reactions for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id));
create policy reactions_insert on public.reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id));
create policy reactions_update on public.reactions for update to authenticated using (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id)) with check (user_id = auth.uid());
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated using (public.is_member() and public.is_peer(user_id));
drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated using (public.is_member() and public.is_peer(user_id));
drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories for select to authenticated using (public.is_member() and public.is_peer(user_id) and (user_id = auth.uid() or expires_at > now()));
drop policy if exists story_views_select on public.story_views;
create policy story_views_select on public.story_views for select to authenticated using (viewer_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));

drop policy if exists media_select on storage.objects;
create policy media_select on storage.objects for select to authenticated using (
  bucket_id = 'media' and public.is_member() and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.messages m where m.media_path = name)
    or exists (select 1 from public.stories s where s.media_path = name)
    or exists (select 1 from public.members mb where mb.avatar_path = name)));

drop function if exists public.mark_read();
create or replace function public.mark_read(p_conv uuid default null) returns void language sql security definer set search_path = public as $$
  update public.messages set read_at = now() where read_at is null and sender_id <> auth.uid()
    and public.is_conv_member(conversation_id) and (p_conv is null or conversation_id = p_conv); $$;
revoke all on function public.mark_read(uuid) from public, anon;
grant execute on function public.mark_read(uuid) to authenticated;

create or replace function public._conv_subs(cid uuid, exclude_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)), '[]'::jsonb)
  from public.push_subscriptions ps join public.conversation_members cm on cm.user_id = ps.user_id
  where cm.conversation_id = cid and ps.user_id <> exclude_uid; $$;
revoke all on function public._conv_subs(uuid, uuid) from public, anon, authenticated;
-- process_due() también se actualizó para trabajar por conversación (programados, recordatorios, insistente);
-- ver la versión en vivo con: select pg_get_functiondef('public.process_due'::regproc);
