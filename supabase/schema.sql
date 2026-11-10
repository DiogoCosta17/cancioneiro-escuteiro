-- Schema completo do Cancioneiro Escuteiro
-- Estado atual da base de dados. Para criar a BD de raiz, corre este ficheiro inteiro no SQL Editor do Supabase.
-- Ao alterar a BD: muda este ficheiro e corre só a parte alterada na BD existente
-- (ex.: o "create or replace function" de uma função, ou um "alter table ... add column").


-- ==================== Tabelas ====================

-- Dirigentes com acesso de edição. Uma linha pode existir antes da conta (convite por email);
-- user_id é associado quando a pessoa se regista / entra.
create table public.admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null default '',
  email text not null,
  role text not null default 'editor' check (role in ('super_admin', 'editor')),
  invited_by uuid references auth.users(id),
  created_at timestamptz default now(),
  last_sign_in_at timestamptz,
  confirmed_at timestamptz,
  invited_at timestamptz
);

create unique index idx_admins_unique_email on public.admins (lower(email));

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  content text not null,
  tags text[] default '{}',
  original_key text not null default 'C',
  capo integer default null,
  youtube_url text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on column public.songs.capo is 'Posição da braçadeira / capo na guitarra (ex: 1 para 1ª casa, 2 para 2ª casa). Null ou 0 indica sem capo.';

create index idx_songs_title on public.songs(title);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  location text,
  reader_1 text,
  psalmist text,
  reader_2 text,
  prayers text,
  -- Versículo do Aleluia, mostrado por baixo do Aleluia na página do evento e na impressão
  gospel_acclamation text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  constraint events_gospel_acclamation_length
    check (gospel_acclamation is null or length(gospel_acclamation) <= 600)
);

-- Cânticos de cada evento. transpose_semitones / capo / notes são escolhas só para aquele evento
-- (null = usa o tom e o capo da música).
create table public.event_songs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  song_id uuid references public.songs(id) on delete cascade not null,
  moment_name text, -- ex.: "Entrada", "Aclamação", "Comunhão"
  order_index integer not null,
  transpose_semitones smallint,
  capo smallint,
  notes text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  constraint event_songs_transpose_semitones_range
    check (transpose_semitones is null or transpose_semitones between 0 and 11),
  constraint event_songs_capo_range
    check (capo is null or capo between 0 and 11),
  constraint event_songs_notes_length
    check (notes is null or length(notes) <= 500)
);

create table public.song_suggestions (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  youtube_url text,
  chords_url text,
  notes text,
  suggested_by_name text,
  status text not null default 'pending' check (status in ('pending', 'implemented')),
  created_at timestamptz default now() not null,
  implemented_at timestamptz,
  implemented_by text
);

create index idx_song_suggestions_status on public.song_suggestions(status);
create index idx_song_suggestions_created_at on public.song_suggestions(created_at desc);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null,
  user_email text not null,
  action text not null,
  entity_type text not null check (entity_type in ('song', 'event', 'suggestion', 'admin')),
  entity_id text,
  entity_title text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index idx_activity_logs_created_at on public.activity_logs (created_at desc);
create index idx_activity_logs_user_id on public.activity_logs (user_id);
create index idx_activity_logs_entity_type on public.activity_logs (entity_type);
create index idx_activity_logs_action on public.activity_logs (action);

alter table public.admins enable row level security;
alter table public.songs enable row level security;
alter table public.events enable row level security;
alter table public.event_songs enable row level security;
alter table public.song_suggestions enable row level security;
alter table public.activity_logs enable row level security;


-- ==================== Funções auxiliares ====================

-- SECURITY DEFINER para poder ser usada nas políticas de "admins" sem recursão infinita
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where (id = auth.uid() or user_id = auth.uid())
      and role = 'super_admin'
  );
$$;

revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;


-- ==================== Políticas RLS ====================

-- admins: cada um vê só a sua linha; o super_admin vê todas
create policy "Admins can view own row or all if super admin"
  on public.admins for select
  to authenticated
  using (
    id = auth.uid()
    or user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_super_admin()
  );

create policy "Super admins can insert admins"
  on public.admins for insert
  to authenticated
  with check (
    exists (
      select 1 from public.admins
      where (id = auth.uid() or user_id = auth.uid()) and role = 'super_admin'
    )
  );

create policy "Super admins can update admins"
  on public.admins for update
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where (id = auth.uid() or user_id = auth.uid()) and role = 'super_admin'
    )
  );

-- A escalada de privilégios na própria linha é bloqueada pelo trigger protect_admin_role_escalation
create policy "Admins can update own profile"
  on public.admins for update
  to authenticated
  using (
    id = auth.uid()
    or user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    id = auth.uid()
    or user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "Super admins can delete admins"
  on public.admins for delete
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where (id = auth.uid() or user_id = auth.uid()) and role = 'super_admin'
    )
  );

-- songs
create policy "Anyone can view songs"
  on public.songs for select
  using (true);

create policy "Admins can insert songs"
  on public.songs for insert
  to authenticated
  with check (
    exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  );

create policy "Admins can update songs"
  on public.songs for update
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  );

create policy "Admins can delete songs"
  on public.songs for delete
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  );

-- events
create policy "Public can view events"
  on public.events for select
  using (true);

create policy "Admins can manage events"
  on public.events for all
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  );

-- event_songs
create policy "Public can view event_songs"
  on public.event_songs for select
  using (true);

create policy "Admins can manage event_songs"
  on public.event_songs for all
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  );

-- song_suggestions: qualquer visitante sugere (só 'pending', campos limitados, URLs http(s));
-- os dirigentes veem e marcam como implementadas; o super_admin apaga as implementadas
create policy "Anyone can submit song suggestions"
  on public.song_suggestions for insert
  to public
  with check (
    status = 'pending'
    and implemented_at is null
    and implemented_by is null
    and length(trim(title)) > 0
    and length(title) <= 250
    and (youtube_url is null or (length(youtube_url) <= 500 and youtube_url ~* '^https?://'))
    and (chords_url is null or (length(chords_url) <= 500 and chords_url ~* '^https?://'))
    and (notes is null or length(notes) <= 2000)
    and (suggested_by_name is null or length(suggested_by_name) <= 150)
  );

create policy "Admins can view song suggestions"
  on public.song_suggestions for select
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  );

create policy "Admins can update song suggestions"
  on public.song_suggestions for update
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  );

create policy "Super admins can delete implemented suggestions"
  on public.song_suggestions for delete
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where (id = auth.uid() or user_id = auth.uid()) and role = 'super_admin'
    )
    and status = 'implemented'
  );

-- activity_logs: sem política de UPDATE (o histórico não pode ser alterado depois de escrito)
create policy "Super admins can view activity logs"
  on public.activity_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where (id = auth.uid() or user_id = auth.uid()) and role = 'super_admin'
    )
  );

create policy "Authenticated users can insert activity logs"
  on public.activity_logs for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.admins
      where id = auth.uid() or user_id = auth.uid()
    )
  );

create policy "Super admins can delete activity logs"
  on public.activity_logs for delete
  to authenticated
  using (
    exists (
      select 1 from public.admins
      where (id = auth.uid() or user_id = auth.uid()) and role = 'super_admin'
    )
  );


-- ==================== Triggers: songs ====================

create or replace function public.handle_updated_at()
returns trigger
set search_path = public
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at
  before update on public.songs
  for each row
  execute function public.handle_updated_at();


-- ==================== Triggers: auth.users -> admins ====================

-- No registo, associa a conta ao convite com o mesmo email e preenche o nome se estiver vazio
create or replace function public.link_admin_on_signup()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  update public.admins
  set user_id = new.id,
      name = case
        when (name is null or name = '' or name = lower(email))
        then coalesce(nullif(new.raw_user_meta_data->>'name', ''), new.raw_user_meta_data->>'full_name', name)
        else name
      end
  where lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created_link_admin
  after insert on auth.users
  for each row execute function public.link_admin_on_signup();

-- No registo, copia o estado da conta (login, confirmação, convite) para admins
create or replace function public.handle_new_auth_user()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  update public.admins
  set
    user_id = new.id,
    last_sign_in_at = coalesce(new.last_sign_in_at, last_sign_in_at),
    confirmed_at = coalesce(new.confirmed_at, new.email_confirmed_at, confirmed_at),
    invited_at = coalesce(new.invited_at, invited_at)
  where lower(email) = lower(new.email) or id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_created_sync_admin
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Em cada login / confirmação, mantém o estado da conta sincronizado em admins
create or replace function public.handle_auth_user_sign_in()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  update public.admins
  set
    last_sign_in_at = coalesce(new.last_sign_in_at, last_sign_in_at),
    confirmed_at = coalesce(new.confirmed_at, new.email_confirmed_at, confirmed_at),
    invited_at = coalesce(new.invited_at, invited_at),
    user_id = coalesce(user_id, new.id)
  where lower(email) = lower(new.email) or id = new.id or user_id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_sign_in_sync_admin
  after update of last_sign_in_at, confirmed_at, email_confirmed_at, invited_at on auth.users
  for each row execute function public.handle_auth_user_sign_in();


-- ==================== Triggers: admins ====================

-- Ao remover um dirigente, apaga também a conta em auth.users (invalida o login)
create or replace function public.handle_admin_deletion()
returns trigger
security definer
set search_path = public, auth
language plpgsql
as $$
begin
  if old.user_id is not null then
    delete from auth.users where id = old.user_id;
  end if;
  return old;
end;
$$;

create trigger on_admin_deleted
  after delete on public.admins
  for each row execute function public.handle_admin_deletion();

-- Quem não é super_admin só pode alterar o nome e o last_sign_in_at da sua linha,
-- e associar o user_id à sua própria conta. Backend (service_role, SQL Editor) não é restringido.
create or replace function public.protect_admin_role_escalation()
returns trigger
security invoker
set search_path = public
language plpgsql
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if (new.role is distinct from old.role)
     or (new.email is distinct from old.email)
     or (new.id is distinct from old.id)
     or (new.user_id is distinct from old.user_id and new.user_id is distinct from auth.uid())
     or (new.confirmed_at is distinct from old.confirmed_at)
     or (new.invited_at is distinct from old.invited_at)
     or (new.invited_by is distinct from old.invited_by)
     or (new.created_at is distinct from old.created_at)
  then
    if not public.is_super_admin() then
      raise exception 'Apenas super administradores podem alterar funções, e-mails, contas associadas ou o estado de convite de administradores.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_protect_admin_role_escalation
  before update on public.admins
  for each row
  execute function public.protect_admin_role_escalation();

-- Mantém o Display Name do Supabase Auth igual ao nome do dirigente
create or replace function public.sync_admin_name_to_auth_user()
returns trigger
security definer
set search_path = public, auth
language plpgsql
as $$
begin
  if new.name is distinct from old.name and new.name is not null and new.name != '' then
    update auth.users
    set raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{name}',
      to_jsonb(new.name)
    )
    where id = new.user_id
       or id = new.id
       or lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;

create trigger on_admin_name_updated_sync_auth
  after update of name on public.admins
  for each row execute function public.sync_admin_name_to_auth_user();


-- ==================== Triggers: histórico (activity_logs) ====================

-- Registo automático de criação / edição (com diferenças campo a campo) / remoção de cânticos
create or replace function public.log_song_activity()
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
      'song_created',
      'song',
      new.id::text,
      new.title,
      jsonb_build_object('artista', new.artist, 'capo', new.capo)
    );
    return new;
  elsif TG_OP = 'UPDATE' then
    if old.title is distinct from new.title then
      changes := changes || jsonb_build_object('title', jsonb_build_object('old', old.title, 'new', new.title));
    end if;

    if old.artist is distinct from new.artist then
      changes := changes || jsonb_build_object('artist', jsonb_build_object('old', coalesce(old.artist, ''), 'new', coalesce(new.artist, '')));
    end if;

    if old.original_key is distinct from new.original_key then
      changes := changes || jsonb_build_object('original_key', jsonb_build_object('old', old.original_key, 'new', new.original_key));
    end if;

    if old.capo is distinct from new.capo then
      changes := changes || jsonb_build_object('capo', jsonb_build_object('old', old.capo, 'new', new.capo));
    end if;

    if old.youtube_url is distinct from new.youtube_url then
      changes := changes || jsonb_build_object('youtube_url', jsonb_build_object('old', coalesce(old.youtube_url, ''), 'new', coalesce(new.youtube_url, '')));
    end if;

    if old.tags is distinct from new.tags then
      changes := changes || jsonb_build_object('tags', jsonb_build_object(
        'old', to_jsonb(coalesce(old.tags, '{}'::text[])),
        'new', to_jsonb(coalesce(new.tags, '{}'::text[]))
      ));
    end if;

    if old.content is distinct from new.content then
      changes := changes || jsonb_build_object('content', jsonb_build_object(
        'changed', true,
        'old', old.content,
        'new', new.content
      ));
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
      'song_updated',
      'song',
      new.id::text,
      new.title,
      jsonb_build_object('artista', new.artist, 'changes', changes)
    );
    return new;
  elsif TG_OP = 'DELETE' then
    insert into public.activity_logs (user_id, user_name, user_email, action, entity_type, entity_id, entity_title, details)
    values (
      cur_user_id,
      coalesce(cur_name, 'Dirigente'),
      coalesce(cur_email, 'desconhecido'),
      'song_deleted',
      'song',
      old.id::text,
      old.title,
      jsonb_build_object('artista', old.artist)
    );
    return old;
  end if;
  return null;
end;
$$;

create trigger on_song_activity_log
  after insert or update or delete on public.songs
  for each row execute function public.log_song_activity();

-- Registo automático de criação / edição (com diferenças campo a campo) / remoção de eventos
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

create trigger on_event_activity_log
  after insert or update or delete on public.events
  for each row execute function public.log_event_activity();

-- Registos escritos pela app: autor e data preenchidos no servidor, só ações conhecidas,
-- e as ações de gestão reservadas ao super_admin. Os triggers acima (SECURITY DEFINER) não passam aqui.
create or replace function public.stamp_activity_log_author()
returns trigger
security invoker
set search_path = public
language plpgsql
as $$
declare
  caller_name text;
  caller_email text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.action not in (
    'suggestion_implemented', 'suggestion_rejected', 'event_songs_updated',
    'admin_invited', 'admin_role_changed', 'admin_renamed', 'admin_removed', 'backup_restored'
  ) then
    raise exception 'Ação de histórico não permitida: %', new.action;
  end if;

  if (new.action like 'admin\_%' or new.action = 'backup_restored') and not public.is_super_admin() then
    raise exception 'Apenas super administradores podem registar esta ação.';
  end if;

  select a.name, a.email into caller_name, caller_email
  from public.admins a
  where a.id = auth.uid() or a.user_id = auth.uid()
  limit 1;

  new.user_id := auth.uid();
  new.user_name := coalesce(
    nullif(trim(caller_name), ''),
    nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), ''),
    'Dirigente'
  );
  new.user_email := coalesce(nullif(caller_email, ''), auth.jwt() ->> 'email', 'desconhecido');
  new.created_at := now();
  return new;
end;
$$;

create trigger trg_stamp_activity_log_author
  before insert on public.activity_logs
  for each row execute function public.stamp_activity_log_author();


-- ==================== RPCs (chamadas pela app) ====================

-- Lista de dirigentes com estado da conta e número de cânticos criados (só super_admin)
create or replace function public.get_admins_overview()
returns table (
  id uuid,
  user_id uuid,
  name text,
  email text,
  role text,
  invited_by uuid,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  confirmed_at timestamptz,
  invited_at timestamptz,
  songs_count bigint
)
security invoker
set search_path = public
language plpgsql
as $$
#variable_conflict use_column
declare
  caller_is_super boolean;
begin
  select exists (
    select 1 from public.admins a
    where (a.id = auth.uid() or a.user_id = auth.uid())
      and a.role = 'super_admin'
  ) into caller_is_super;

  if not coalesce(caller_is_super, false) then
    raise exception 'Acesso restrito a Super Administradores.';
  end if;

  return query
  select
    adm.id,
    adm.user_id,
    adm.name,
    adm.email,
    adm.role,
    adm.invited_by,
    adm.created_at,
    adm.last_sign_in_at,
    adm.confirmed_at,
    adm.invited_at,
    count(distinct s.id)::bigint as songs_count
  from public.admins adm
  left join public.songs s on (
    s.created_by = adm.user_id
    or s.created_by = adm.id
  )
  group by
    adm.id, adm.user_id, adm.name, adm.email, adm.role, adm.invited_by, adm.created_at,
    adm.last_sign_in_at, adm.confirmed_at, adm.invited_at
  order by adm.created_at desc;
end;
$$;

-- Limpa todo o histórico (só super_admin; usa a política de DELETE de activity_logs)
create or replace function public.clear_activity_logs()
returns jsonb
security invoker
set search_path = public
language plpgsql
as $$
declare
  caller_is_super boolean;
  deleted_count bigint;
begin
  select exists (
    select 1 from public.admins a
    where (a.id = auth.uid() or a.user_id = auth.uid())
      and a.role = 'super_admin'
  ) into caller_is_super;

  if not coalesce(caller_is_super, false) then
    raise exception 'Apenas Super Administradores podem limpar o histórico de logs.';
  end if;

  delete from public.activity_logs where true;
  get diagnostics deleted_count = row_count;

  return jsonb_build_object('success', true, 'deleted_count', deleted_count);
end;
$$;


-- ==================== Permissões das funções ====================
-- O Supabase dá EXECUTE a anon/authenticated em funções novas do schema public por defeito.

revoke execute on function public.get_admins_overview() from public, anon;
grant execute on function public.get_admins_overview() to authenticated;

revoke execute on function public.clear_activity_logs() from public, anon;
grant execute on function public.clear_activity_logs() to authenticated;

revoke execute on function public.handle_updated_at() from public, anon, authenticated;
revoke execute on function public.link_admin_on_signup() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_sign_in() from public, anon, authenticated;
revoke execute on function public.handle_admin_deletion() from public, anon, authenticated;
revoke execute on function public.protect_admin_role_escalation() from public, anon, authenticated;
revoke execute on function public.sync_admin_name_to_auth_user() from public, anon, authenticated;
revoke execute on function public.log_song_activity() from public, anon, authenticated;
revoke execute on function public.log_event_activity() from public, anon, authenticated;
revoke execute on function public.stamp_activity_log_author() from public, anon, authenticated;

-- Função de event trigger que alguns projetos Supabase criam no schema public
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
