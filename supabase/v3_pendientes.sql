-- v3: recordatorios, mensajes programados y modo insistente.
-- Ya está aplicado en el proyecto en vivo. Solo córrelo si montas el chat en otro proyecto de Supabase
-- (después de schema.sql). Cambia site_url por tu dominio de Netlify.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

alter table public.members add column if not exists nudges_on boolean not null default false;

create table if not exists public.private_config (key text primary key, value text not null);
alter table public.private_config enable row level security;
revoke all on public.private_config from anon, authenticated;
insert into public.private_config(key, value) values
  ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex')),
  ('site_url', 'https://nosotros-chat.netlify.app'),
  ('push_enabled', 'false'),   -- ponlo en 'true' cuando CRON_SECRET ya esté en Netlify
  ('tz', 'America/Mexico_City'),
  ('quiet_from', '0'), ('quiet_to', '8')  -- horas sin insistencia (0 a 8 am)
on conflict (key) do nothing;

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  remind_at timestamptz not null,
  done boolean not null default false,
  fired int not null default 0,
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);
create index if not exists reminders_due_idx on public.reminders (remind_at) where not done;
alter table public.reminders enable row level security;
create policy reminders_select on public.reminders for select to authenticated using (user_id = auth.uid() and public.is_member());
create policy reminders_insert on public.reminders for insert to authenticated with check (user_id = auth.uid() and public.is_member());
create policy reminders_update on public.reminders for update to authenticated using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());
create policy reminders_delete on public.reminders for delete to authenticated using (user_id = auth.uid() and public.is_member());

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','canceled')),
  sent_message_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_due_idx on public.scheduled_messages (send_at) where status = 'pending';
alter table public.scheduled_messages enable row level security;
create policy sched_select on public.scheduled_messages for select to authenticated using (sender_id = auth.uid() and public.is_member());
create policy sched_insert on public.scheduled_messages for insert to authenticated with check (sender_id = auth.uid() and public.is_member() and status = 'pending');
create policy sched_update on public.scheduled_messages for update to authenticated using (sender_id = auth.uid() and public.is_member() and status = 'pending') with check (sender_id = auth.uid() and status in ('pending','canceled'));
create policy sched_delete on public.scheduled_messages for delete to authenticated using (sender_id = auth.uid() and public.is_member());

create table if not exists public.nudges (
  id bigint generated always as identity primary key,
  to_user uuid not null,
  message_id uuid not null references public.messages(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index if not exists nudges_lookup_idx on public.nudges (to_user, message_id);
alter table public.nudges enable row level security;
revoke all on public.nudges from anon, authenticated;

create or replace function public._subs(uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]'::jsonb)
  from public.push_subscriptions where user_id = uid; $$;

create or replace function public._snip(m public.messages) returns text language sql immutable set search_path = public as $$
  select case m.kind when 'text' then left(coalesce(m.body, ''), 90) when 'image' then '📷 Foto'
    when 'audio' then '🎤 Mensaje de voz' else '💜 Está pensando en ti' end; $$;

create or replace function public._partner(uid uuid) returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.members where user_id <> uid limit 1; $$;

create or replace function public.process_due() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_on text; v_tz text; v_qf int; v_qt int; v_hour int; v_quiet boolean;
  v_url text; v_secret text;
  r record; u record; m public.messages%rowtype;
  v_name text; v_n int; v_last timestamptz; v_due timestamptz;
  v_sched int := 0; v_rem int := 0; v_nud int := 0; v_subs jsonb;
begin
  select value into v_on from private_config where key = 'push_enabled';
  select value into v_tz from private_config where key = 'tz';
  select value::int into v_qf from private_config where key = 'quiet_from';
  select value::int into v_qt from private_config where key = 'quiet_to';
  v_hour := extract(hour from (now() at time zone coalesce(v_tz, 'UTC')))::int;
  v_quiet := v_hour >= coalesce(v_qf, 0) and v_hour < coalesce(v_qt, 0);

  -- 1) mensajes programados
  for r in select * from scheduled_messages where status = 'pending' and send_at <= now()
           order by send_at limit 50 for update skip locked loop
    insert into messages (sender_id, kind, body) values (r.sender_id, 'text', r.body) returning * into m;
    update scheduled_messages set status = 'sent', sent_message_id = m.id where id = r.id;
    v_sched := v_sched + 1;
    if v_on = 'true' then
      select display_name into v_name from members where user_id = r.sender_id;
      v_subs := _subs(_partner(r.sender_id));
      if jsonb_array_length(v_subs) > 0 then
        v_items := v_items || jsonb_build_object('title', coalesce(v_name, 'Nosotros'), 'body', _snip(m), 'tag', 'msg-' || m.id, 'subs', v_subs);
      end if;
    end if;
  end loop;

  if v_on = 'true' then
    -- 2) recordatorios (se repiten cada 30 min, máx. 4 veces, si tienes el modo insistente)
    update reminders rm set done = true
    where not rm.done and rm.fired > 0
      and exists (select 1 from messages x where x.sender_id = rm.user_id and x.created_at > rm.last_fired_at);

    for r in select rm.*, mb.nudges_on from reminders rm join members mb on mb.user_id = rm.user_id
             where not rm.done and rm.remind_at <= now()
               and (rm.fired = 0 or (mb.nudges_on and rm.fired < 4 and rm.last_fired_at <= now() - interval '30 minutes'))
             order by rm.remind_at limit 50 for update of rm skip locked loop
      m := null;
      select * into m from messages where id = r.message_id;
      update reminders set fired = fired + 1, last_fired_at = now() where id = r.id;
      v_rem := v_rem + 1;
      v_subs := _subs(r.user_id);
      if m.id is not null and jsonb_array_length(v_subs) > 0 then
        v_items := v_items || jsonb_build_object('title', case when r.fired = 0 then '⏰ Recordatorio' else '⏰ Sigue pendiente' end,
          'body', _snip(m), 'tag', 'rem-' || r.id, 'subs', v_subs);
      end if;
    end loop;

    -- 3) insistente: último mensaje de la otra persona sin contestar (30 min, 2 h, 6 h, 24 h)
    if not v_quiet then
      for u in select user_id from members where nudges_on loop
        m := null;
        select * into m from messages order by created_at desc limit 1;
        continue when m.id is null or m.sender_id = u.user_id or m.kind = 'ping' or m.created_at < now() - interval '3 days';
        select count(*), max(sent_at) into v_n, v_last from nudges where to_user = u.user_id and message_id = m.id;
        continue when v_n >= 4;
        v_due := case when v_n = 0 then m.created_at + interval '30 minutes'
                      else v_last + case v_n when 1 then interval '2 hours' when 2 then interval '6 hours' else interval '24 hours' end end;
        continue when now() < v_due;
        insert into nudges (to_user, message_id) values (u.user_id, m.id);
        v_nud := v_nud + 1;
        select display_name into v_name from members where user_id = m.sender_id;
        v_subs := _subs(u.user_id);
        if jsonb_array_length(v_subs) > 0 then
          v_items := v_items || jsonb_build_object(
            'title', case when v_n = 0 then '💬 ' || coalesce(v_name, 'Tu persona') || ' espera tu respuesta'
                          else '⏳ Sigues sin contestarle a ' || coalesce(v_name, 'tu persona') end,
            'body', _snip(m), 'tag', 'nudge-' || u.user_id, 'subs', v_subs);
        end if;
      end loop;
    end if;
  end if;

  if jsonb_array_length(v_items) > 0 then
    select value into v_url from private_config where key = 'site_url';
    select value into v_secret from private_config where key = 'cron_secret';
    perform net.http_post(url := v_url || '/api/push-due',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('items', v_items), timeout_milliseconds := 15000);
  end if;
  return jsonb_build_object('scheduled', v_sched, 'reminders', v_rem, 'nudges', v_nud, 'items', jsonb_array_length(v_items));
end $$;

create or replace function public.set_prefs(p_nudges boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'no autorizado'; end if;
  update public.members set nudges_on = p_nudges where user_id = auth.uid();
end $$;

revoke all on function public._subs(uuid), public._snip(public.messages), public._partner(uuid), public.process_due() from public, anon, authenticated;
revoke all on function public.set_prefs(boolean) from public, anon;
grant execute on function public.set_prefs(boolean) to authenticated;

select cron.schedule('nosotros-due', '* * * * *', $$select public.process_due()$$);

-- v4 (aplicado): fotos de perfil e historias. Ver también supabase/v4_perfil_historias.sql
