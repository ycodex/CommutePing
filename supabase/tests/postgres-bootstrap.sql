-- Minimal Supabase compatibility objects for executing the migration in plain PostgreSQL.
-- These stubs validate SQL and RPC behavior; they are never deployed.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema extensions;
create schema auth;
create schema realtime;

create table auth.users (
  id uuid primary key,
  phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user::text)
$$;

create table realtime.messages (topic text, extension text);
create or replace function realtime.topic()
returns text language sql stable as $$ select ''::text $$;

create or replace function realtime.send(
  payload jsonb,
  event text,
  topic text,
  private boolean default true
)
returns void language plpgsql as $$ begin return; end $$;
