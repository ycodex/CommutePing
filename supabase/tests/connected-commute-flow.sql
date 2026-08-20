insert into auth.users(id, phone, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', '+919876543210', '{"display_name":"Traveller"}'),
  ('22222222-2222-4222-8222-222222222222', '+919123456789', '{"display_name":"Guardian"}');

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
create temporary table flow_invite as
select * from public.create_trusted_invite('+919123456789', 'Guardian', 'Family');

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
select public.accept_trusted_invite((select invite_code from flow_invite));

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
create temporary table flow_commute as
select public.start_shared_commute(
  'office-route',
  'Office',
  '{"label":"Home","latitude":12.9756,"longitude":77.6063}',
  '{"label":"Office","latitude":12.9784,"longitude":77.6408}',
  '[{"latitude":12.9756,"longitude":77.6063},{"latitude":12.9784,"longitude":77.6408}]',
  now() + interval '1 hour',
  array[(select invite_id from flow_invite)]
) as commute_id;

select public.update_commute_heartbeat(
  (select commute_id from flow_commute), 12.976::double precision, 77.61::double precision,
  15::double precision, 72::smallint, 'moving', 'on-route', 1::bigint, now()
);
select public.update_commute_heartbeat(
  (select commute_id from flow_commute), 12.977::double precision, 77.62::double precision,
  20::double precision, 71::smallint, 'preserve', 'preserve', 2::bigint, now()
);

do $$
begin
  if (select movement_status from public.commute_live where commute_id = (select commute_id from flow_commute)) <> 'moving'
    or (select route_status from public.commute_live where commute_id = (select commute_id from flow_commute)) <> 'on-route' then
    raise exception 'Background heartbeat overwrote foreground classifications';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$
begin
  if not public.can_access_commute((select commute_id from flow_commute)) then
    raise exception 'Guardian could not access accepted commute';
  end if;
  if (select count(*) from public.list_monitored_commutes()) <> 1 then
    raise exception 'Guardian monitoring list did not contain the commute';
  end if;
end;
$$;
select public.acknowledge_commute((select commute_id from flow_commute));

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select public.revoke_trusted_connection((select invite_id from flow_invite));

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$
begin
  if public.can_access_commute((select commute_id from flow_commute)) then
    raise exception 'Revoked guardian retained commute access';
  end if;
  if (select count(*) from public.list_monitored_commutes()) <> 0 then
    raise exception 'Revoked guardian retained a monitored commute';
  end if;
end;
$$;
