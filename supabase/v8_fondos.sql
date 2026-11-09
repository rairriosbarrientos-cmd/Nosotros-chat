-- v8 (aplicado en vivo como "nosotros_v8_fondos"): tema 'gara' + fondos animados
alter table public.conversation_members drop constraint if exists conv_theme_check;
alter table public.conversation_members add constraint conv_theme_check check (
  theme in ('aurora','rose','ocean','forest','sunset','mono','gold','gara')
  and wall in ('none','gara','stars','nebula','synth','petals','bokeh','hearts','rain','fireflies','dots','lines'));
