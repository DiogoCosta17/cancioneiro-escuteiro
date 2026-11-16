-- 022: missa vespertina nos eventos (16-11-2026)
-- Sábado à tarde ou véspera de solenidade: o evento celebra a liturgia do dia seguinte.
-- Corre tudo no SQL Editor do Supabase (New query -> Run). Pode correr-se mais do que uma vez.

alter table public.events
  add column if not exists evening_mass boolean not null default false;

-- Histórico de atividade: regista também a mudança de "Missa vespertina"
create or replace function public.log_event_activity()
returns trigger
security definer
set search_path = public, auth
language plpgsql
as $$
declare
  cur_user_id uuid := auth.uid();
  cur_name text := 'Dirigente';
  cur_email text := '';
  changes jsonb := '{}'::jsonb;
begin
  if cur_user_id is not null then
    select coalesce(nullif(name, ''), split_part(email, '@', 1)), email
    into cur_name, cur_email
    from public.admins
    where id = cur_user_id or user_id = cur_user_id
    limit 1;

    if cur_email is null or cur_email = '' then
      select coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1)), email
      into cur_name, cur_email
      from auth.users
      where id = cur_user_id
      limit 1;
    end if;
  else
    cur_name := 'Sistema';
    cur_email := 'sistema@cancioneiro';
  end if;

  if TG_OP = 'INSERT' then
    insert into public.activity_logs (user_id, user_name, user_email, action, entity_type, entity_id, entity_title, details)
    values (
      cur_user_id,
      coalesce(cur_name, 'Dirigente'),
      coalesce(cur_email, 'desconhecido'),
      'event_created',
      'event',
      new.id::text,
      new.title,
      jsonb_build_object('data', new.date, 'local', new.location)
    );
    return new;
  elsif TG_OP = 'UPDATE' then
    if old.title is distinct from new.title then
      changes := changes || jsonb_build_object('title', jsonb_build_object('old', old.title, 'new', new.title));
    end if;

    if old.date is distinct from new.date then
      changes := changes || jsonb_build_object('date', jsonb_build_object('old', old.date::text, 'new', new.date::text));
    end if;

    if old.location is distinct from new.location then
      changes := changes || jsonb_build_object('location', jsonb_build_object('old', coalesce(old.location, ''), 'new', coalesce(new.location, '')));
    end if;

    if old.reader_1 is distinct from new.reader_1 then
      changes := changes || jsonb_build_object('reader_1', jsonb_build_object('old', coalesce(old.reader_1, ''), 'new', coalesce(new.reader_1, '')));
    end if;

    if old.psalmist is distinct from new.psalmist then
      changes := changes || jsonb_build_object('psalmist', jsonb_build_object('old', coalesce(old.psalmist, ''), 'new', coalesce(new.psalmist, '')));
    end if;

    if old.reader_2 is distinct from new.reader_2 then
      changes := changes || jsonb_build_object('reader_2', jsonb_build_object('old', coalesce(old.reader_2, ''), 'new', coalesce(new.reader_2, '')));
    end if;

    if old.prayers is distinct from new.prayers then
      changes := changes || jsonb_build_object('prayers', jsonb_build_object('old', coalesce(old.prayers, ''), 'new', coalesce(new.prayers, '')));
    end if;

    if old.gospel_acclamation is distinct from new.gospel_acclamation then
      changes := changes || jsonb_build_object('gospel_acclamation', jsonb_build_object('old', coalesce(old.gospel_acclamation, ''), 'new', coalesce(new.gospel_acclamation, '')));
    end if;

    if old.evening_mass is distinct from new.evening_mass then
      changes := changes || jsonb_build_object('evening_mass', jsonb_build_object(
        'old', case when old.evening_mass then 'Sim' else 'Não' end,
        'new', case when new.evening_mass then 'Sim' else 'Não' end));
    end if;

    -- Sem diferenças nos campos acompanhados: não regista nada
    if changes = '{}'::jsonb then
      return new;
    end if;

    insert into public.activity_logs (user_id, user_name, user_email, action, entity_type, entity_id, entity_title, details)
    values (
      cur_user_id,
      coalesce(cur_name, 'Dirigente'),
      coalesce(cur_email, 'desconhecido'),
      'event_updated',
      'event',
      new.id::text,
      new.title,
      jsonb_build_object('data', new.date, 'local', new.location, 'changes', changes)
    );
    return new;
  elsif TG_OP = 'DELETE' then
    insert into public.activity_logs (user_id, user_name, user_email, action, entity_type, entity_id, entity_title, details)
    values (
      cur_user_id,
      coalesce(cur_name, 'Dirigente'),
      coalesce(cur_email, 'desconhecido'),
      'event_deleted',
      'event',
      old.id::text,
      old.title,
      '{}'::jsonb
    );
    return old;
  end if;
  return null;
end;
$$;
