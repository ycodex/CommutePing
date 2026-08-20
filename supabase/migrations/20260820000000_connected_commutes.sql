create extension if not exists pgcrypto with schema extensions;

create type public.trusted_connection_status as enum ('pending', 'accepted', 'revoked');
create type public.commute_status as enum ('active', 'completed', 'cancelled');
create type public.commute_event_type as enum (
  'started',
  'heartbeat',
  'deviation',
  'late',
  'location_delayed',
  'acknowledged',
  'completed',
  'cancelled',
  'sos'
);
create type public.notification_outbox_status as enum ('pending', 'processing', 'sent', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trusted_connections (
  id uuid primary key default gen_random_uuid(),
  traveller_id uuid not null references public.profiles(id) on delete cascade,
  guardian_id uuid references public.profiles(id) on delete cascade,
  contact_name text not null check (char_length(contact_name) between 1 and 80),
  relation text not null check (char_length(relation) between 1 and 80),
  status public.trusted_connection_status not null default 'pending',
  invited_phone_hash bytea not null,
  invite_token_hash bytea unique,
  invite_expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'accepted' and guardian_id is not null and accepted_at is not null and invite_token_hash is null)
    or (status = 'pending' and guardian_id is null and accepted_at is null and invite_token_hash is not null)
    or status = 'revoked'),
  check (traveller_id is distinct from guardian_id)
);

create unique index trusted_connections_accepted_pair_idx
  on public.trusted_connections(traveller_id, guardian_id)
  where status = 'accepted';
create index trusted_connections_traveller_idx on public.trusted_connections(traveller_id, status);
create index trusted_connections_guardian_idx on public.trusted_connections(guardian_id, status);

create table public.commutes (
  id uuid primary key default gen_random_uuid(),
  traveller_id uuid not null references public.profiles(id) on delete cascade,
  route_local_id text not null check (char_length(route_local_id) between 1 and 80),
  route_title text not null check (char_length(route_title) between 1 and 100),
  origin jsonb not null,
  destination jsonb not null,
  route_coordinates jsonb not null check (
    jsonb_typeof(route_coordinates) = 'array'
    and jsonb_array_length(route_coordinates) between 2 and 2000
  ),
  status public.commute_status not null default 'active',
  started_at timestamptz not null default now(),
  expected_arrival_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_arrival_at > started_at and expected_arrival_at <= started_at + interval '12 hours'),
  check ((status = 'active' and completed_at is null) or (status <> 'active' and completed_at is not null))
);

create unique index one_active_commute_per_traveller_idx
  on public.commutes(traveller_id)
  where status = 'active';
create index commutes_traveller_started_idx on public.commutes(traveller_id, started_at desc);

create table public.commute_guardians (
  commute_id uuid not null references public.commutes(id) on delete cascade,
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.trusted_connections(id) on delete restrict,
  notified_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (commute_id, guardian_id),
  unique (commute_id, connection_id)
);
create index commute_guardians_guardian_idx on public.commute_guardians(guardian_id, commute_id);

create table public.commute_live (
  commute_id uuid primary key references public.commutes(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters between 0 and 5000),
  battery_percent smallint check (battery_percent is null or battery_percent between 0 and 100),
  movement_status text not null check (movement_status in ('moving', 'stationary', 'idle', 'unknown')),
  route_status text not null check (route_status in ('on-route', 'checking', 'deviated', 'unavailable')),
  network_status text not null check (network_status in ('online', 'unknown')),
  sequence_number bigint not null check (sequence_number > 0),
  observed_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.commute_events (
  id uuid primary key default gen_random_uuid(),
  commute_id uuid not null references public.commutes(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type public.commute_event_type not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096)
);
create index commute_events_commute_created_idx on public.commute_events(commute_id, created_at desc);

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 250),
  platform text not null check (platform in ('android', 'ios')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index device_push_tokens_user_idx on public.device_push_tokens(user_id, enabled);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  commute_id uuid references public.commutes(id) on delete cascade,
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 180),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 180),
  data jsonb not null default '{}'::jsonb,
  status public.notification_outbox_status not null default 'pending',
  attempt_count smallint not null default 0 check (attempt_count between 0 and 10),
  available_at timestamptz not null default now(),
  processing_at timestamptz,
  sent_at timestamptz,
  provider_ticket_id text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 4096)
);
create index notification_outbox_pending_idx on public.notification_outbox(status, available_at);

alter table public.profiles enable row level security;
alter table public.trusted_connections enable row level security;
alter table public.commutes enable row level security;
alter table public.commute_guardians enable row level security;
alter table public.commute_live enable row level security;
alter table public.commute_events enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.trusted_connections from anon, authenticated;
revoke all on public.commutes from anon, authenticated;
revoke all on public.commute_guardians from anon, authenticated;
revoke all on public.commute_live from anon, authenticated;
revoke all on public.commute_events from anon, authenticated;
revoke all on public.device_push_tokens from anon, authenticated;
revoke all on public.notification_outbox from anon, authenticated;

grant select, update(display_name) on public.profiles to authenticated;
grant select on public.commutes to authenticated;

create or replace function public.can_access_commute(p_commute_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.commutes c
    where c.id = p_commute_id
      and (
        c.traveller_id = auth.uid()
        or exists (
          select 1
          from public.commute_guardians cg
          join public.trusted_connections tc on tc.id = cg.connection_id
          where cg.commute_id = c.id
            and cg.guardian_id = auth.uid()
            and tc.status = 'accepted'
        )
      )
  );
$$;

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id = auth.uid()
    or exists (
      select 1 from public.trusted_connections tc
      where tc.status = 'accepted'
        and ((tc.traveller_id = auth.uid() and tc.guardian_id = p_profile_id)
          or (tc.guardian_id = auth.uid() and tc.traveller_id = p_profile_id))
    );
$$;

create policy profiles_select_connected
  on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy trusted_connections_select_participant
  on public.trusted_connections for select to authenticated
  using (traveller_id = auth.uid() or (guardian_id = auth.uid() and status = 'accepted'));
create policy commutes_select_participant
  on public.commutes for select to authenticated
  using (public.can_access_commute(id));
create policy commute_guardians_select_participant
  on public.commute_guardians for select to authenticated
  using (
    exists (
      select 1 from public.trusted_connections tc
      where tc.id = connection_id and tc.guardian_id = auth.uid() and tc.status = 'accepted'
    )
    or exists (
      select 1 from public.commutes c where c.id = commute_id and c.traveller_id = auth.uid()
    )
  );
create policy commute_live_select_participant
  on public.commute_live for select to authenticated
  using (public.can_access_commute(commute_id));
create policy commute_events_select_participant
  on public.commute_events for select to authenticated
  using (public.can_access_commute(commute_id));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'CommutePing user'), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

insert into public.profiles(id, display_name)
select u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''), 'CommutePing user'), 80)
from auth.users u
on conflict (id) do nothing;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger trusted_connections_touch_updated_at before update on public.trusted_connections
  for each row execute function public.touch_updated_at();
create trigger commutes_touch_updated_at before update on public.commutes
  for each row execute function public.touch_updated_at();
create trigger notification_outbox_touch_updated_at before update on public.notification_outbox
  for each row execute function public.touch_updated_at();

create or replace function public.create_trusted_invite(
  p_phone_e164 text,
  p_contact_name text,
  p_relation text
)
returns table(invite_id uuid, invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  v_invite_id uuid;
  v_expires_at timestamptz := now() + interval '24 hours';
  v_recent_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Invalid invitation details'; end if;
  if char_length(btrim(p_contact_name)) not between 1 and 80
    or char_length(btrim(p_relation)) not between 1 and 80 then
    raise exception 'Invalid invitation details';
  end if;

  perform 1 from public.profiles where id = v_user_id for update;
  select count(*) into v_recent_count
  from public.trusted_connections
  where traveller_id = v_user_id and created_at > now() - interval '1 hour';
  if v_recent_count >= 5 then raise exception 'Invitation limit reached'; end if;
  if (select count(*) from public.trusted_connections where traveller_id = v_user_id and status <> 'revoked') >= 10 then
    raise exception 'Trusted contact limit reached';
  end if;

  v_code := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.trusted_connections(
    traveller_id,
    contact_name,
    relation,
    invited_phone_hash,
    invite_token_hash,
    invite_expires_at
  ) values (
    v_user_id,
    btrim(p_contact_name),
    btrim(p_relation),
    extensions.digest(p_phone_e164 || ':' || v_code, 'sha256'),
    extensions.digest(v_code, 'sha256'),
    v_expires_at
  ) returning id into v_invite_id;

  return query select v_invite_id, v_code, v_expires_at;
end;
$$;

create or replace function public.accept_trusted_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  v_connection public.trusted_connections%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_invite_code !~ '^[0-9a-f]{48}$' then raise exception 'Invitation is invalid or expired'; end if;

  select phone into v_phone from auth.users where id = v_user_id;
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Invitation is invalid or expired';
  end if;

  select * into v_connection
  from public.trusted_connections
  where invite_token_hash = extensions.digest(lower(p_invite_code), 'sha256')
    and status = 'pending'
    and invite_expires_at > now()
  for update;

  if not found
    or v_connection.traveller_id = v_user_id
    or v_connection.invited_phone_hash <> extensions.digest(v_phone || ':' || lower(p_invite_code), 'sha256') then
    raise exception 'Invitation is invalid or expired';
  end if;
  if exists (
    select 1 from public.trusted_connections
    where traveller_id = v_connection.traveller_id
      and guardian_id = v_user_id
      and status = 'accepted'
  ) then raise exception 'Invitation is invalid or expired';
  end if;

  update public.trusted_connections
  set guardian_id = v_user_id,
      status = 'accepted',
      accepted_at = now(),
      invite_token_hash = null
  where id = v_connection.id;
  return v_connection.id;
end;
$$;

create or replace function public.revoke_trusted_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trusted_connections
  set status = 'revoked', revoked_at = now(), invite_token_hash = null
  where id = p_connection_id
    and status <> 'revoked'
    and (traveller_id = auth.uid() or guardian_id = auth.uid());
  if not found then raise exception 'Trusted connection was not found'; end if;
end;
$$;

create or replace function public.start_shared_commute(
  p_route_local_id text,
  p_route_title text,
  p_origin jsonb,
  p_destination jsonb,
  p_route_coordinates jsonb,
  p_expected_arrival_at timestamptz,
  p_connection_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_commute_id uuid;
  v_coordinate jsonb;
  v_selected_count integer;
  v_inserted_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(p_route_local_id)) not between 1 and 80
    or char_length(btrim(p_route_title)) not between 1 and 100
    or jsonb_typeof(p_origin) <> 'object'
    or jsonb_typeof(p_destination) <> 'object'
    or pg_column_size(p_origin) > 2048
    or pg_column_size(p_destination) > 2048
    or jsonb_typeof(p_route_coordinates) <> 'array'
    or jsonb_array_length(p_route_coordinates) not between 2 and 2000
    or p_expected_arrival_at <= now()
    or p_expected_arrival_at > now() + interval '12 hours'
    or coalesce(array_length(p_connection_ids, 1), 0) not between 1 and 10 then
    raise exception 'Invalid commute details';
  end if;

  if jsonb_typeof(p_origin -> 'label') is distinct from 'string'
    or jsonb_typeof(p_origin -> 'latitude') is distinct from 'number'
    or jsonb_typeof(p_origin -> 'longitude') is distinct from 'number'
    or jsonb_typeof(p_destination -> 'label') is distinct from 'string'
    or jsonb_typeof(p_destination -> 'latitude') is distinct from 'number'
    or jsonb_typeof(p_destination -> 'longitude') is distinct from 'number' then
    raise exception 'Invalid commute details';
  end if;
  if char_length(btrim(p_origin ->> 'label')) not between 1 and 180
    or char_length(btrim(p_destination ->> 'label')) not between 1 and 180
    or (p_origin ->> 'latitude')::double precision not between -90 and 90
    or (p_origin ->> 'longitude')::double precision not between -180 and 180
    or (p_destination ->> 'latitude')::double precision not between -90 and 90
    or (p_destination ->> 'longitude')::double precision not between -180 and 180 then
    raise exception 'Invalid commute details';
  end if;

  for v_coordinate in select value from jsonb_array_elements(p_route_coordinates)
  loop
    if jsonb_typeof(v_coordinate) <> 'object'
      or jsonb_typeof(v_coordinate -> 'latitude') <> 'number'
      or jsonb_typeof(v_coordinate -> 'longitude') <> 'number'
      or (v_coordinate ->> 'latitude')::double precision not between -90 and 90
      or (v_coordinate ->> 'longitude')::double precision not between -180 and 180 then
      raise exception 'Invalid commute details';
    end if;
  end loop;

  select count(distinct value) into v_selected_count from unnest(p_connection_ids) value;
  if v_selected_count <> array_length(p_connection_ids, 1) then raise exception 'Invalid trusted contacts'; end if;

  perform 1 from public.profiles where id = v_user_id for update;
  if exists (select 1 from public.commutes where traveller_id = v_user_id and status = 'active') then
    raise exception 'A commute is already active';
  end if;

  insert into public.commutes(
    traveller_id, route_local_id, route_title, origin, destination, route_coordinates, expected_arrival_at
  ) values (
    v_user_id, btrim(p_route_local_id), btrim(p_route_title), p_origin, p_destination,
    p_route_coordinates, p_expected_arrival_at
  ) returning id into v_commute_id;

  insert into public.commute_guardians(commute_id, guardian_id, connection_id)
  select v_commute_id, tc.guardian_id, tc.id
  from public.trusted_connections tc
  where tc.id = any(p_connection_ids)
    and tc.traveller_id = v_user_id
    and tc.status = 'accepted'
    and tc.guardian_id is not null;
  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> v_selected_count then raise exception 'Invalid trusted contacts'; end if;

  insert into public.commute_events(commute_id, actor_id, event_type, detail)
  values (v_commute_id, v_user_id, 'started', jsonb_build_object('routeTitle', btrim(p_route_title)));

  insert into public.notification_outbox(recipient_id, commute_id, dedupe_key, title, body, data)
  select cg.guardian_id,
         v_commute_id,
         'commute-start:' || v_commute_id::text || ':' || cg.guardian_id::text,
         'Commute started',
         'Someone you monitor started a commute. Open CommutePing for live status.',
         jsonb_build_object('commuteId', v_commute_id, 'kind', 'started')
  from public.commute_guardians cg where cg.commute_id = v_commute_id;

  return v_commute_id;
end;
$$;

create or replace function public.update_commute_heartbeat(
  p_commute_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_battery_percent smallint,
  p_movement_status text,
  p_route_status text,
  p_sequence_number bigint,
  p_observed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_route_status text;
  v_previous_movement_status text;
  v_effective_route_status text;
  v_effective_movement_status text;
  v_updated boolean := false;
  v_updated_count integer := 0;
begin
  if auth.uid() is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
    or (p_accuracy_meters is not null and p_accuracy_meters not between 0 and 5000)
    or (p_battery_percent is not null and p_battery_percent not between 0 and 100)
    or p_movement_status not in ('moving', 'stationary', 'idle', 'unknown', 'preserve')
    or p_route_status not in ('on-route', 'checking', 'deviated', 'unavailable', 'preserve')
    or p_sequence_number <= 0
    or p_observed_at > now() + interval '5 minutes'
    or p_observed_at < now() - interval '24 hours' then
    raise exception 'Invalid heartbeat';
  end if;
  if not exists (
    select 1 from public.commutes
    where id = p_commute_id and traveller_id = auth.uid() and status = 'active'
  ) then raise exception 'Active commute was not found'; end if;

  select route_status, movement_status into v_previous_route_status, v_previous_movement_status
  from public.commute_live where commute_id = p_commute_id;
  v_effective_route_status := case
    when p_route_status = 'preserve' then coalesce(v_previous_route_status, 'unavailable')
    else p_route_status
  end;
  v_effective_movement_status := case
    when p_movement_status = 'preserve' then coalesce(v_previous_movement_status, 'unknown')
    else p_movement_status
  end;

  insert into public.commute_live(
    commute_id, latitude, longitude, accuracy_meters, battery_percent,
    movement_status, route_status, network_status, sequence_number, observed_at
  ) values (
    p_commute_id, p_latitude, p_longitude, p_accuracy_meters, p_battery_percent,
    v_effective_movement_status, v_effective_route_status, 'online', p_sequence_number, p_observed_at
  )
  on conflict (commute_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters,
    battery_percent = excluded.battery_percent,
    movement_status = excluded.movement_status,
    route_status = excluded.route_status,
    network_status = excluded.network_status,
    sequence_number = excluded.sequence_number,
    observed_at = excluded.observed_at,
    updated_at = now()
  where excluded.sequence_number > public.commute_live.sequence_number;
  get diagnostics v_updated_count = row_count;
  v_updated := v_updated_count > 0;

  if v_updated and v_effective_route_status = 'deviated' and v_previous_route_status is distinct from 'deviated' then
    insert into public.commute_events(commute_id, actor_id, event_type, detail)
    values (p_commute_id, auth.uid(), 'deviation', jsonb_build_object('sequence', p_sequence_number));
    insert into public.notification_outbox(recipient_id, commute_id, dedupe_key, title, body, data)
    select cg.guardian_id,
           p_commute_id,
           'route-deviation:' || p_commute_id::text || ':' || p_sequence_number::text || ':' || cg.guardian_id::text,
           'Urgent commute alert',
           'A route deviation was confirmed. Open CommutePing to review the live status.',
           jsonb_build_object('commuteId', p_commute_id, 'kind', 'deviation')
    from public.commute_guardians cg where cg.commute_id = p_commute_id;
  end if;
  return v_updated;
end;
$$;

create or replace function public.complete_shared_commute(p_commute_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.commutes
  set status = 'completed', completed_at = now()
  where id = p_commute_id and traveller_id = auth.uid() and status = 'active';
  if not found then raise exception 'Active commute was not found'; end if;

  insert into public.commute_events(commute_id, actor_id, event_type)
  values (p_commute_id, auth.uid(), 'completed');
  insert into public.notification_outbox(recipient_id, commute_id, dedupe_key, title, body, data)
  select cg.guardian_id,
         p_commute_id,
         'commute-completed:' || p_commute_id::text || ':' || cg.guardian_id::text,
         'Reached safely',
         'The commute was marked complete by the traveller.',
         jsonb_build_object('commuteId', p_commute_id, 'kind', 'completed')
  from public.commute_guardians cg where cg.commute_id = p_commute_id;
end;
$$;

create or replace function public.cancel_shared_commute(p_commute_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.commutes
  set status = 'cancelled', completed_at = now()
  where id = p_commute_id and traveller_id = auth.uid() and status = 'active';
  if not found then raise exception 'Active commute was not found'; end if;

  insert into public.commute_events(commute_id, actor_id, event_type)
  values (p_commute_id, auth.uid(), 'cancelled');
  insert into public.notification_outbox(recipient_id, commute_id, dedupe_key, title, body, data)
  select cg.guardian_id,
         p_commute_id,
         'commute-cancelled:' || p_commute_id::text || ':' || cg.guardian_id::text,
         'Commute sharing cancelled',
         'The traveller cancelled this commute session.',
         jsonb_build_object('commuteId', p_commute_id, 'kind', 'cancelled')
  from public.commute_guardians cg where cg.commute_id = p_commute_id;
end;
$$;

create or replace function public.acknowledge_commute(p_commute_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_traveller_id uuid;
begin
  update public.commute_guardians cg
  set acknowledged_at = coalesce(acknowledged_at, now())
  where cg.commute_id = p_commute_id
    and cg.guardian_id = auth.uid()
    and cg.acknowledged_at is null
    and exists (
      select 1
      from public.commutes c
      join public.trusted_connections tc on tc.id = cg.connection_id
      where c.id = p_commute_id and c.status = 'active' and tc.status = 'accepted'
    )
  returning (select traveller_id from public.commutes where id = p_commute_id) into v_traveller_id;
  if not found then raise exception 'Commute was not found'; end if;

  insert into public.commute_events(commute_id, actor_id, event_type)
  values (p_commute_id, auth.uid(), 'acknowledged');
  insert into public.notification_outbox(recipient_id, commute_id, dedupe_key, title, body, data)
  values (
    v_traveller_id,
    p_commute_id,
    'commute-ack:' || p_commute_id::text || ':' || auth.uid()::text,
    'Trusted contact is monitoring',
    'A trusted contact acknowledged your active commute.',
    jsonb_build_object('commuteId', p_commute_id, 'kind', 'acknowledged')
  ) on conflict (dedupe_key) do nothing;
end;
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_user uuid;
begin
  if auth.uid() is null
    or p_platform not in ('android', 'ios')
    or char_length(p_token) not between 20 and 250
    or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Invalid push registration';
  end if;
  select user_id into v_existing_user from public.device_push_tokens where token = p_token for update;
  if v_existing_user is not null and v_existing_user <> auth.uid() then
    raise exception 'Invalid push registration';
  end if;
  insert into public.device_push_tokens(user_id, token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (token) do update set enabled = true, last_seen_at = now(), platform = excluded.platform;
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.device_push_tokens
  set enabled = false, last_seen_at = now()
  where user_id = auth.uid() and token = p_token;
$$;

create or replace function public.list_trusted_connections()
returns table(
  connection_id uuid,
  contact_name text,
  relation text,
  status public.trusted_connection_status,
  accepted_user_name text,
  invite_expires_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select tc.id,
         tc.contact_name,
         tc.relation,
         tc.status,
         p.display_name,
         tc.invite_expires_at,
         tc.accepted_at
  from public.trusted_connections tc
  left join public.profiles p on p.id = tc.guardian_id
  where tc.traveller_id = auth.uid() and tc.status <> 'revoked'
  order by tc.created_at desc
  limit 20;
$$;

create or replace function public.list_monitored_commutes()
returns table(
  commute_id uuid,
  traveller_name text,
  route_title text,
  commute_status public.commute_status,
  started_at timestamptz,
  expected_arrival_at timestamptz,
  completed_at timestamptz,
  acknowledged_at timestamptz,
  route_coordinates jsonb,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  battery_percent smallint,
  movement_status text,
  route_status text,
  last_observed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         p.display_name,
         c.route_title,
         c.status,
         c.started_at,
         c.expected_arrival_at,
         c.completed_at,
         cg.acknowledged_at,
         c.route_coordinates,
         cl.latitude,
         cl.longitude,
         cl.accuracy_meters,
         cl.battery_percent,
         cl.movement_status,
         cl.route_status,
         cl.observed_at
  from public.commute_guardians cg
  join public.trusted_connections tc on tc.id = cg.connection_id and tc.status = 'accepted'
  join public.commutes c on c.id = cg.commute_id
  join public.profiles p on p.id = c.traveller_id
  left join public.commute_live cl on cl.commute_id = c.id
  where cg.guardian_id = auth.uid()
    and (c.status = 'active' or c.completed_at > now() - interval '24 hours')
  order by (c.status = 'active') desc, c.started_at desc
  limit 20;
$$;

create or replace function public.get_owned_active_commute()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.commutes
  where traveller_id = auth.uid() and status = 'active'
  order by started_at desc limit 1;
$$;

create or replace function public.can_access_commute_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id_text text;
begin
  if p_topic !~ '^commute:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  v_id_text := split_part(p_topic, ':', 2);
  return public.can_access_commute(v_id_text::uuid);
end;
$$;

create policy commute_broadcasts_select_participant
  on realtime.messages for select to authenticated
  using (extension = 'broadcast' and public.can_access_commute_topic(realtime.topic()));

create or replace function public.broadcast_commute_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commute_id uuid;
begin
  if tg_table_name = 'commutes' then
    v_commute_id := coalesce(new.id, old.id);
  else
    v_commute_id := coalesce(new.commute_id, old.commute_id);
  end if;
  perform realtime.send(
    jsonb_build_object('commuteId', v_commute_id, 'operation', tg_op),
    'changed',
    'commute:' || v_commute_id::text,
    true
  );
  return coalesce(new, old);
end;
$$;

create trigger commutes_broadcast_change
  after insert or update or delete on public.commutes
  for each row execute function public.broadcast_commute_change();
create trigger commute_live_broadcast_change
  after insert or update or delete on public.commute_live
  for each row execute function public.broadcast_commute_change();
create trigger commute_events_broadcast_change
  after insert or update or delete on public.commute_events
  for each row execute function public.broadcast_commute_change();

create or replace function public.claim_notification_batch(p_commute_id uuid default null)
returns table(
  notification_id uuid,
  recipient_id uuid,
  commute_id uuid,
  title text,
  body text,
  data jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
  return query
  with claimed as (
    select no.id
    from public.notification_outbox no
    where no.status in ('pending', 'processing', 'failed')
      and no.available_at <= now()
      and no.attempt_count < 10
      and (no.status in ('pending', 'failed') or no.processing_at < now() - interval '5 minutes')
      and (p_commute_id is null or no.commute_id = p_commute_id)
    order by no.created_at
    for update skip locked
    limit 50
  ), updated as (
    update public.notification_outbox no
    set status = 'processing', processing_at = now(), attempt_count = no.attempt_count + 1
    from claimed
    where no.id = claimed.id
    returning no.id, no.recipient_id, no.commute_id, no.title, no.body, no.data
  )
  select updated.id, updated.recipient_id, updated.commute_id,
         updated.title, updated.body, updated.data
  from updated;
end;
$$;

revoke execute on function public.can_access_commute(uuid) from public, anon;
revoke execute on function public.can_view_profile(uuid) from public, anon;
revoke execute on function public.create_trusted_invite(text, text, text) from public, anon;
revoke execute on function public.accept_trusted_invite(text) from public, anon;
revoke execute on function public.revoke_trusted_connection(uuid) from public, anon;
revoke execute on function public.start_shared_commute(text, text, jsonb, jsonb, jsonb, timestamptz, uuid[]) from public, anon;
revoke execute on function public.update_commute_heartbeat(uuid, double precision, double precision, double precision, smallint, text, text, bigint, timestamptz) from public, anon;
revoke execute on function public.complete_shared_commute(uuid) from public, anon;
revoke execute on function public.cancel_shared_commute(uuid) from public, anon;
revoke execute on function public.acknowledge_commute(uuid) from public, anon;
revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
revoke execute on function public.list_trusted_connections() from public, anon;
revoke execute on function public.list_monitored_commutes() from public, anon;
revoke execute on function public.get_owned_active_commute() from public, anon;
revoke execute on function public.can_access_commute_topic(text) from public, anon;
revoke execute on function public.claim_notification_batch(uuid) from public, anon, authenticated;

grant execute on function public.can_access_commute(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.create_trusted_invite(text, text, text) to authenticated;
grant execute on function public.accept_trusted_invite(text) to authenticated;
grant execute on function public.revoke_trusted_connection(uuid) to authenticated;
grant execute on function public.start_shared_commute(text, text, jsonb, jsonb, jsonb, timestamptz, uuid[]) to authenticated;
grant execute on function public.update_commute_heartbeat(uuid, double precision, double precision, double precision, smallint, text, text, bigint, timestamptz) to authenticated;
grant execute on function public.complete_shared_commute(uuid) to authenticated;
grant execute on function public.cancel_shared_commute(uuid) to authenticated;
grant execute on function public.acknowledge_commute(uuid) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.list_trusted_connections() to authenticated;
grant execute on function public.list_monitored_commutes() to authenticated;
grant execute on function public.get_owned_active_commute() to authenticated;
grant execute on function public.can_access_commute_topic(text) to authenticated;
grant execute on function public.claim_notification_batch(uuid) to service_role;
