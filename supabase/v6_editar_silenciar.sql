-- v6: editar mensajes, silenciar/fijar chats. Ya aplicado en el proyecto en vivo.
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.conversation_members add column if not exists muted boolean not null default false, add column if not exists pinned boolean not null default false;

create or replace function public.edit_message(p_id uuid, p_body text) returns void language plpgsql security definer set search_path = public as $$
declare v text := btrim(coalesce(p_body, ''));
begin
  if char_length(v) < 1 or char_length(v) > 4000 then raise exception 'texto inválido'; end if;
  update public.messages set body = v, edited_at = now()
   where id = p_id and sender_id = auth.uid() and kind = 'text' and created_at > now() - interval '24 hours' and public.is_conv_member(conversation_id);
  if not found then raise exception 'no se puede editar'; end if;
end $$;
revoke all on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

create or replace function public.set_conv_prefs(p_conv uuid, p_muted boolean, p_pinned boolean) returns void language sql security definer set search_path = public as $$
  update public.conversation_members set muted = coalesce(p_muted, muted), pinned = coalesce(p_pinned, pinned)
   where conversation_id = p_conv and user_id = auth.uid(); $$;
revoke all on function public.set_conv_prefs(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_conv_prefs(uuid, boolean, boolean) to authenticated;

-- _conv_subs ahora excluye chats silenciados (and not cm.muted) y process_due() salta el insistente en chats silenciados
-- (en el loop de nudges: "where mb.nudges_on and not cm.muted"). Ver la función en vivo con pg_get_functiondef.
