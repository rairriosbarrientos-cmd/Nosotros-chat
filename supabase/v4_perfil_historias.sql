-- v4: foto de perfil e historias (24 h). Ya aplicado en el proyecto en vivo.
alter table public.members add column if not exists avatar_path text;

create or replace function public.set_avatar(p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'no autorizado'; end if;
  if p_path is not null and p_path not like auth.uid()::text || '/%' then raise exception 'ruta inválida'; end if;
  update public.members set avatar_path = p_path where user_id = auth.uid();
end $$;
revoke all on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('image','text')),
  media_path text,
  caption text check (caption is null or char_length(caption) <= 220),
  bg text check (bg is null or char_length(bg) <= 20),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint stories_shape check ((kind = 'image' and media_path is not null) or (kind = 'text' and caption is not null and char_length(caption) > 0))
);
create index if not exists stories_user_idx on public.stories (user_id, created_at);
alter table public.stories enable row level security;
create policy stories_select on public.stories for select to authenticated using (public.is_member() and (user_id = auth.uid() or expires_at > now()));
create policy stories_insert on public.stories for insert to authenticated with check (public.is_member() and user_id = auth.uid() and (media_path is null or media_path like auth.uid()::text || '/%') and expires_at <= now() + interval '25 hours');
create policy stories_delete on public.stories for delete to authenticated using (public.is_member() and user_id = auth.uid());

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
alter table public.story_views enable row level security;
create policy story_views_select on public.story_views for select to authenticated using (public.is_member());
create policy story_views_insert on public.story_views for insert to authenticated with check (public.is_member() and viewer_id = auth.uid() and exists (select 1 from public.stories s where s.id = story_id and s.user_id <> auth.uid() and s.expires_at > now()));

alter publication supabase_realtime add table public.stories;
alter publication supabase_realtime add table public.story_views;
