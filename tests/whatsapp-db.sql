-- Run only against the disposable local integration database, after the migration.
-- All fixtures and changes roll back. psql -v ON_ERROR_STOP=1 -f tests/whatsapp-db.sql
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_true(p_value boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %', p_message; end if;
end;
$$;

insert into public.permissions(permission_name) values ('customer.view') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.role_name='owner' and p.permission_name='customer.view'
on conflict do nothing;

insert into auth.users(id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000001');
insert into public.company(id, company_name) values
  ('a1000000-0000-4000-8000-000000000001', 'WhatsApp isolated test A'),
  ('b1000000-0000-4000-8000-000000000001', 'WhatsApp isolated test B');
-- Existing auth triggers may prepare profiles; replace only these test fixtures.
delete from public.user_profile where user_id in (
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001'
);
insert into public.user_profile(user_id, company_id, full_name, role) values
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Test A', 'owner'),
  ('b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Test B', 'owner'),
  ('c0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Test denied', 'owner');
insert into public.customer(id, company_id, customer_number, customer_name) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'WA-TEST-A', 'Test Customer A'),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'WA-TEST-B', 'Test Customer B');
insert into public.whatsapp_account(id, company_id, phone_number_id, business_account_id) values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '991001', '992001'),
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', '991002', '992002');

select pg_temp.assert_true(not has_table_privilege('anon', 'public.whatsapp_message', 'SELECT'), 'anon cannot read messages');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'public.whatsapp_message', 'INSERT'), 'staff cannot fabricate messages');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'public.whatsapp_conversation', 'UPDATE'), 'staff cannot bypass controlled updates');
select pg_temp.assert_true(not has_function_privilege('authenticated',
  'public.whatsapp_ingest_message(text,text,text,text,text,text,text,timestamptz,text,text,text)', 'EXECUTE'), 'staff cannot invoke webhook ingestion');
select pg_temp.assert_true(not has_function_privilege('anon',
  'public.whatsapp_apply_status(text,text,text,text,timestamptz,text,uuid)', 'EXECUTE'), 'anonymous users cannot forge delivery receipts');
select pg_temp.assert_true(has_function_privilege('service_role',
  'public.whatsapp_ingest_message(text,text,text,text,text,text,text,timestamptz,text,text,text)', 'EXECUTE'), 'webhook service can ingest');

set local role service_role;
select pg_temp.assert_true(
  (public.whatsapp_ingest_message('991001','WRONG','27820000001','A','wa-test-wrong','text','Wrong account',now())->>'ignored')::boolean,
  'WABA mismatch ignored');
select public.whatsapp_ingest_message('991001','992001','27820000001','A','wa-test-in-1','text','First',now()-interval '1 hour')->>'conversation_id' as conversation_a \gset
select public.whatsapp_ingest_message('991002','992002','27820000002','B','wa-test-in-1','text','Tenant B',now())->>'conversation_id' as conversation_b \gset
select pg_temp.assert_true(
  (public.whatsapp_ingest_message('991001','992001','27820000001','A','wa-test-in-1','text','Duplicate',now())->>'duplicate')::boolean,
  'duplicate provider ID deduplicates');
select pg_temp.assert_true((select unread_count = 1 from public.whatsapp_conversation where id = :'conversation_a'), 'duplicate does not increment unread');
select public.whatsapp_ingest_message('991001','992001','27820000001','A','wa-test-old','text','Delayed',now()-interval '2 hours');
select pg_temp.assert_true((select last_inbound_at > now()-interval '90 minutes' from public.whatsapp_conversation where id = :'conversation_a'), 'delayed inbound never regresses reply window');
select public.whatsapp_ingest_message('991001','992001','27820000001','A','wa-test-stop','text',' stop ',now());
select public.whatsapp_ingest_message('991001','992001','27820000001','A','wa-test-after-stop','text','Another question',now());
select pg_temp.assert_true((select opted_out from public.whatsapp_conversation where id = :'conversation_a'), 'STOP remains set after ordinary inbound');
select clock_timestamp()::text as read_through \gset
select public.whatsapp_ingest_message('991001','992001','27820000001','A','wa-test-after-snapshot','text','Unread after snapshot',now());

-- Reserve an outbound row before the provider request.
insert into public.whatsapp_message (
  id, company_id, account_id, conversation_id, direction, message_type, body,
  client_request_id, payload_fingerprint, status, created_by
) values (
  'a4000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001',
  :'conversation_a', 'outbound', 'text', 'Reserved reply',
  'a5000000-0000-4000-8000-000000000001', 'test-fingerprint', 'sending',
  'a0000000-0000-4000-8000-000000000001'
);
select public.whatsapp_apply_status('991001','992001','wa-test-out-1','delivered',now(),null,'a5000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select status='delivered' and provider_message_id='wa-test-out-1' from public.whatsapp_message where id='a4000000-0000-4000-8000-000000000001'), 'callback attaches provider ID before send response');
select public.whatsapp_apply_status('991001','992001','wa-test-out-1','sent',now()+interval '1 minute');
select public.whatsapp_apply_status('991001','992001','wa-test-out-1','failed',now()+interval '2 minutes','131000');
select pg_temp.assert_true((select status='delivered' and error_code is null from public.whatsapp_message where id='a4000000-0000-4000-8000-000000000001'), 'late sent and failed cannot regress delivered');
select public.whatsapp_apply_status('991001','992001','wa-test-out-1','read',now()-interval '2 minutes');
select public.whatsapp_apply_status('991001','992001','wa-test-out-1','delivered',now());
select pg_temp.assert_true((select status='read' from public.whatsapp_message where id='a4000000-0000-4000-8000-000000000001'), 'higher evidence wins despite out-of-order timestamps; read never regresses');
select pg_temp.assert_true((public.whatsapp_apply_status('991002','992002','wa-test-out-1','failed',now(),null,'a5000000-0000-4000-8000-000000000001')->>'ignored')::boolean, 'callback request ID cannot cross accounts');
select pg_temp.assert_true((public.whatsapp_apply_status('991001','992001','wa-test-wrong-provider','failed',now(),null,'a5000000-0000-4000-8000-000000000001')->>'ignored')::boolean, 'conflicting provider ID cannot overwrite reservation');

-- Composite tenant foreign keys apply to privileged writes too.
do $$
begin
  begin
    insert into public.whatsapp_conversation(company_id, account_id, wa_id)
    values ('b1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','27820000003');
    raise exception 'FAIL: cross-company account FK allowed';
  exception when foreign_key_violation then null; end;
  begin
    update public.whatsapp_conversation set customer_id='b2000000-0000-4000-8000-000000000001'
    where account_id='a3000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: cross-company customer FK allowed';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.whatsapp_message(company_id,account_id,conversation_id,direction,message_type,body,client_request_id,payload_fingerprint,status)
    select company_id,account_id,id,'outbound','template','Paid template','a5000000-0000-4000-8000-000000000099','test','sending'
    from public.whatsapp_conversation where account_id='a3000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: paid template outbound allowed';
  exception when check_violation then null; end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.whatsapp_account), 'owner only sees own account');
select pg_temp.assert_true((select count(*)=1 from public.whatsapp_conversation), 'owner only sees own conversation');
select pg_temp.assert_true(not exists(select 1 from public.whatsapp_message where company_id='b1000000-0000-4000-8000-000000000001'), 'owner cannot see another tenant messages');
select public.whatsapp_update_conversation(:'conversation_a','a2000000-0000-4000-8000-000000000001','closed',true,false,:'read_through');
select pg_temp.assert_true((select unread_count=1 and status='closed' and not opted_out and customer_id='a2000000-0000-4000-8000-000000000001' from public.whatsapp_conversation where id=:'conversation_a'), 'authorized update preserves messages arriving after read snapshot');
do $$
begin
  begin
    perform public.whatsapp_update_conversation(
      (select id from public.whatsapp_conversation limit 1), 'b2000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: cross-company customer link allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.whatsapp_update_conversation('b6000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: unknown conversation update allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
insert into public.company_user_permission_override(company_id,user_id,permission_id,allowed)
select 'a1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',id,false
from public.permissions where permission_name='customer.view';
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert_true(public.current_user_has_permission('whatsapp.view') and public.current_user_has_permission('whatsapp.send'), 'customer-denied fixture retains WhatsApp access');
do $$
begin
  begin
    perform public.whatsapp_update_conversation((select id from public.whatsapp_conversation limit 1),'a2000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: direct RPC bypassed customer.view denial';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
insert into public.company_user_permission_override(company_id,user_id,permission_id,allowed)
select 'a1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',id,false
from public.permissions where permission_name='whatsapp.send';
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.whatsapp_update_conversation(:'conversation_a',null,null,true);
do $$
begin
  begin
    perform public.whatsapp_update_conversation((select id from public.whatsapp_conversation limit 1),null,'open');
    raise exception 'FAIL: explicit send permission denial bypassed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
insert into public.company_user_permission_override(company_id,user_id,permission_id,allowed)
select 'a1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',id,false
from public.permissions where permission_name='whatsapp.view';
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.whatsapp_conversation), 'explicit view denial hides inbox even from owner role');
select pg_temp.assert_true((select count(*)=0 from public.whatsapp_message), 'explicit view denial hides messages');
reset role;

update public.whatsapp_account set active=false where id='a3000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.assert_true((public.whatsapp_ingest_message('991001','992001','27820000001','A','wa-test-disconnected','text','Ignored',now())->>'ignored')::boolean, 'disconnected account rejects webhook ingestion');
reset role;

select 'PASS: WhatsApp tenant isolation, grants, deduplication, STOP, reply timestamp, delivery ordering, read race, and permission overrides' as result;
rollback;
