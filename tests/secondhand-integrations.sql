-- ISOLATED LOCAL DATABASE ONLY. Run after both fixtures and both migrations.
-- Every synthetic business record and every test-only clock change rolls back.
\set ON_ERROR_STOP on
begin;
create schema sh_integration_test;
create table sh_integration_test.state(key text primary key,value jsonb);
create table sh_integration_test.results(name text,passed boolean);
create function sh_integration_test.assert(p_name text,p_ok boolean) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FAIL: %',p_name; end if;
insert into sh_integration_test.results values(p_name,true); end $$;
create function sh_integration_test.denied(p_name text,p_sql text,p_expected text) returns void language plpgsql as $$
declare v_failed boolean:=false;
begin begin execute p_sql; exception when others then v_failed:=true;
if position(p_expected in sqlerrm)=0 then raise exception 'FAIL: % unexpected error %',p_name,sqlerrm; end if; end;
perform sh_integration_test.assert(p_name,v_failed); end $$;
create function sh_integration_test.state(p_key text) returns jsonb language sql as $$select value from sh_integration_test.state where key=p_key$$;
grant usage on schema sh_integration_test to anon,authenticated;
grant all on all tables in schema sh_integration_test to anon,authenticated;
grant execute on all functions in schema sh_integration_test to anon,authenticated;

insert into auth.users(id,email,email_confirmed_at,is_anonymous,banned_until) values
('11000000-0000-0000-0000-000000000001','integration-owner@example.test',now(),false,null),
('11000000-0000-0000-0000-000000000002','integration-clerk@example.test',now(),false,null),
('11000000-0000-0000-0000-000000000003','integration-auditor@example.test',now(),false,null),
('11000000-0000-0000-0000-000000000004','integration-outsider@example.test',now(),false,null),
('11000000-0000-0000-0000-000000000005','integration-unconfirmed@example.test',null,false,null),
('11000000-0000-0000-0000-000000000006','integration-banned@example.test',now(),false,now()+interval '1 day'),
('11000000-0000-0000-0000-000000000007','integration-anonymous@example.test',now(),true,null);
insert into public.company(id,company_name) values
('21000000-0000-0000-0000-000000000001','Integration company'),
('21000000-0000-0000-0000-000000000002','Other integration company');
insert into public.branch(id,company_id,branch_name) values
('31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Integration branch'),
('31000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','Other integration branch');
insert into public.user_profile(user_id,company_id,role,full_name)
select id,case when email like '%outsider%' then '21000000-0000-0000-0000-000000000002'::uuid else '21000000-0000-0000-0000-000000000001'::uuid end,'owner','Synthetic staff '||right(id::text,1) from auth.users;
insert into nexus_sh.access(user_id,branch_id,company_id,branch_name,role)
select id,'31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Integration branch',
case right(id::text,1) when '1' then 'owner' when '2' then 'clerk' else 'auditor' end
from auth.users where right(id::text,1) in ('1','2','3');
insert into public.customer(id,company_id,customer_name,customer_number,is_active,phone) values
('41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Synthetic exchange customer','CUS-TEST-1',true,'PRIVATE-PHONE-NOT-IN-CHOICES'),
('41000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','Archived customer','CUS-TEST-2',false,null),
('41000000-0000-0000-0000-000000000003','21000000-0000-0000-0000-000000000002','Foreign customer','CUS-TEST-3',true,null);
insert into public.inventory_item(id,company_id,item_name,sku,cost_price,selling_price,is_active) values
('71000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Replacement laptop','REPL-1',300,500,true),
('71000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','Archived replacement','REPL-2',300,500,false),
('71000000-0000-0000-0000-000000000003','21000000-0000-0000-0000-000000000001','Out of stock replacement','REPL-3',300,500,true),
('71000000-0000-0000-0000-000000000004','21000000-0000-0000-0000-000000000001','Other branch replacement','REPL-4',300,500,true),
('71000000-0000-0000-0000-000000000005','21000000-0000-0000-0000-000000000002','Foreign replacement','REPL-5',300,500,true);
insert into public.branch_stock(company_id,branch_id,inventory_item_id,quantity) values
('21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001',2),
('21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002',2),
('21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000003',0),
('21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000004',2),
('21000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000005',2);
-- Jobs exist before acquisition; the established hold guards subsequently apply.
insert into public.service_job(id,company_id,branch_id,serial_number,job_number,status) values
('61000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','EXCHANGE-SERIAL-1','JOB-EXCHANGE-1','received'),
('61000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','EXCHANGE-SERIAL-1','JOB-EXCHANGE-2','received'),
('61000000-0000-0000-0000-000000000003','21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000002','EXCHANGE-SERIAL-1','JOB-CROSS-BRANCH','received'),
('61000000-0000-0000-0000-000000000004','21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001',null,'JOB-NO-IDENTIFIER','received'),
('61000000-0000-0000-0000-000000000005','21000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','EXCHANGE-SERIAL-1','JOB-FOREIGN','received');
insert into sh_integration_test.state values
('base','{"branch_id":"31000000-0000-0000-0000-000000000001"}'),
('party','{"branch_id":"31000000-0000-0000-0000-000000000001","kind":"seller","full_name":"Synthetic exchange seller","id_type":"passport","id_number":"PRIVATE-EXCHANGE-PASSPORT","date_of_birth":"1990-01-01","address":"Synthetic address","phone":"0123456789","original_id_sighted":true,"id_copy_reference":"Secured synthetic copy","verification_reference":"Original synthetic passport sighted"}'),
('links','{"customer_id":"41000000-0000-0000-0000-000000000001","replacement_inventory_item_id":"71000000-0000-0000-0000-000000000001"}');

select sh_integration_test.assert('private estimate table has RLS',(select relrowsecurity from pg_class where oid='nexus_sh.trade_in'::regclass));
select sh_integration_test.assert('base helper bypass revoked',not has_function_privilege('authenticated','nexus_sh.action(text,jsonb)','execute'));
select sh_integration_test.assert('old workspace helper bypass revoked',not has_function_privilege('authenticated','nexus_sh.workspace(uuid)','execute'));
select sh_integration_test.assert('only authenticated can call choices',has_function_privilege('authenticated','public.sh_integration_choices(uuid,text,uuid)','execute') and not has_function_privilege('anon','public.sh_integration_choices(uuid,text,uuid)','execute'));
set local role anon;
select sh_integration_test.denied('anonymous choices denied',$$select public.sh_integration_choices('31000000-0000-0000-0000-000000000001')$$,'permission denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000004',true);
select sh_integration_test.denied('ungranted choices denied',$$select public.sh_integration_choices('31000000-0000-0000-0000-000000000001')$$,'not granted');
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
select sh_integration_test.denied('cross branch choices denied',$$select public.sh_integration_choices('31000000-0000-0000-0000-000000000002')$$,'not granted');
select sh_integration_test.denied('new link action obeys payload size cap',$$select public.sh_action('link_repair',jsonb_build_object('branch_id','31000000-0000-0000-0000-000000000001','unexpected',repeat('a',20001)))$$,'Invalid request payload');
select sh_integration_test.denied('oversized search rejected',$$select public.sh_integration_choices('31000000-0000-0000-0000-000000000001',repeat('a',101))$$,'100 characters');
insert into sh_integration_test.state values('choices',public.sh_integration_choices('31000000-0000-0000-0000-000000000001'));
select sh_integration_test.assert('only active company customer offered',jsonb_array_length(sh_integration_test.state('choices')->'customers')=1);
select sh_integration_test.assert('only active stocked branch replacement offered',jsonb_array_length(sh_integration_test.state('choices')->'replacement_items')=1);
select sh_integration_test.assert('choices exclude private customer details',sh_integration_test.state('choices')::text not like '%PRIVATE-PHONE%');
select sh_integration_test.assert('only confirmed active company staff offered',jsonb_array_length(sh_integration_test.state('choices')->'staff')=3);
select sh_integration_test.assert('search is literal rather than wildcard',jsonb_array_length(public.sh_integration_choices('31000000-0000-0000-0000-000000000001','%')->'customers')=0);
select public.sh_action('policy_update',sh_integration_test.state('base')||'{"hold_days":8,"legal_review_reference":"Synthetic legal review","registration_reference":"Synthetic certificate","premises_confirmed":true,"goods_scope_confirmed":true}');
insert into sh_integration_test.state values('seller',public.sh_action('party_create',sh_integration_test.state('party')));
insert into sh_integration_test.state values('acquire',sh_integration_test.state('base')||sh_integration_test.state('links')||jsonb_build_object(
'seller_id',sh_integration_test.state('seller')->>'id','description','Synthetic exchange laptop','brand','Synthetic','model','Laptop','serial_number','EXCHANGE-SERIAL-1',
'condition','Used with scratches','purchase_amount',125,'valuation_amount',225,'acquired_at',now()-interval '2 hours','acquisition_reference','Synthetic acquisition',
'ownership_reference','Synthetic ownership evidence','ownership_declared',true,'screening_result','clear','screening_source','Synthetic screening','screening_reference','Synthetic clear evidence',
'staff_attestation','Synthetic owner attestation','communications_device',false,'acquisition_type','trade_in','trade_in_reference','Synthetic exchange reference'));
select sh_integration_test.denied('partial trade link rejected',$$select public.sh_action('acquire',sh_integration_test.state('acquire')-'customer_id')$$,'Choose both');
select sh_integration_test.denied('purchase cannot smuggle exchange links',$$select public.sh_action('acquire',sh_integration_test.state('acquire')||'{"acquisition_type":"purchase"}')$$,'Choose both');
select sh_integration_test.denied('inactive customer rejected',$$select public.sh_action('acquire',sh_integration_test.state('acquire')||'{"customer_id":"41000000-0000-0000-0000-000000000002"}')$$,'active customer');
select sh_integration_test.denied('foreign customer rejected',$$select public.sh_action('acquire',sh_integration_test.state('acquire')||'{"customer_id":"41000000-0000-0000-0000-000000000003"}')$$,'active customer');
select sh_integration_test.denied('inactive replacement rejected',$$select public.sh_action('acquire',sh_integration_test.state('acquire')||'{"replacement_inventory_item_id":"71000000-0000-0000-0000-000000000002"}')$$,'available replacement');
select sh_integration_test.denied('out of stock replacement rejected',$$select public.sh_action('acquire',sh_integration_test.state('acquire')||'{"replacement_inventory_item_id":"71000000-0000-0000-0000-000000000003"}')$$,'available replacement');
select sh_integration_test.denied('cross branch replacement rejected',$$select public.sh_action('acquire',sh_integration_test.state('acquire')||'{"replacement_inventory_item_id":"71000000-0000-0000-0000-000000000004"}')$$,'available replacement');
select sh_integration_test.denied('foreign replacement rejected',$$select public.sh_action('acquire',sh_integration_test.state('acquire')||'{"replacement_inventory_item_id":"71000000-0000-0000-0000-000000000005"}')$$,'available replacement');
insert into sh_integration_test.state values('item',public.sh_action('acquire',sh_integration_test.state('acquire')||'{"replacement_price":1,"balance_due":1,"allowance_amount":9999}'));
insert into sh_integration_test.state values('workspace',public.sh_workspace(null));
select sh_integration_test.assert('trade estimate computed by server',sh_integration_test.state('workspace')->'items'->0->'trade_in' @> '{"replacement_price":500,"allowance_amount":125,"balance_due":375,"excess_allowance":0}');
select sh_integration_test.assert('workspace still masks private IDs',sh_integration_test.state('workspace')::text not like '%PRIVATE-EXCHANGE-PASSPORT%');
select sh_integration_test.assert('hold policy retained',(sh_integration_test.state('workspace')->'items'->0->>'hold_until')::timestamptz>=now()+interval '8 days');
select sh_integration_test.assert('trade snapshot included in full export',public.sh_register_export('31000000-0000-0000-0000-000000000001')->'register'->0->'trade_in' @> '{"replacement_price":500,"balance_due":375}');
select sh_integration_test.denied('private trade table cannot be read directly','select * from nexus_sh.trade_in','permission denied');
select sh_integration_test.denied('base action cannot bypass appendix',$$select nexus_sh.action('acquire',sh_integration_test.state('acquire'))$$,'permission denied');
insert into sh_integration_test.state values('repair',sh_integration_test.state('base')||jsonb_build_object('item_id',sh_integration_test.state('item')->>'id','service_job_id','61000000-0000-0000-0000-000000000001'));
select sh_integration_test.denied('link repair before hold denied',$$select public.sh_action('link_repair',sh_integration_test.state('repair'))$$,'holding period');
select sh_integration_test.assert('matching repairs offered without foreign or null identifiers',jsonb_array_length(public.sh_integration_choices('31000000-0000-0000-0000-000000000001','',(sh_integration_test.state('item')->>'id')::uuid)->'repair_jobs')=2);
select sh_integration_test.denied('foreign item lookup denied',$$select public.sh_integration_choices('31000000-0000-0000-0000-000000000001','',gen_random_uuid())$$,'not available');
reset role;
select sh_integration_test.assert('failed acquisitions leave no partial rows',(select count(*)=1 from nexus_sh.item));
select sh_integration_test.assert('exchange has no stock movement or stock reservation',(select quantity=2 from public.branch_stock where inventory_item_id='71000000-0000-0000-0000-000000000001'));
select sh_integration_test.denied('trade snapshot immutable even for accidental admin edit','update nexus_sh.trade_in set replacement_price=1','append-only');
update public.inventory_item set selling_price=700 where id='71000000-0000-0000-0000-000000000001';
select sh_integration_test.assert('replacement price snapshot survives catalogue price change',(select replacement_price=500 from nexus_sh.trade_in));
-- Only a disposable-test administrator advances the synthetic hold clock.
alter table nexus_sh.item disable trigger sh_item_immutable;
update nexus_sh.item set recorded_at=now()-interval '9 days',acquired_at=now()-interval '10 days',hold_until=now()-interval '1 day';
alter table nexus_sh.item enable trigger sh_item_immutable;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
select sh_integration_test.denied('elapsed hold alone does not permit repair link',$$select public.sh_action('link_repair',sh_integration_test.state('repair'))$$,'Owner approval');
select public.sh_action('approve',sh_integration_test.state('base')||jsonb_build_object('item_id',sh_integration_test.state('item')->>'id','staff_attestation','Synthetic review approval'));
select sh_integration_test.denied('wrong branch repair link denied',$$select public.sh_action('link_repair',sh_integration_test.state('repair')||'{"service_job_id":"61000000-0000-0000-0000-000000000003"}')$$,'Repair job must match');
select sh_integration_test.denied('foreign company repair link denied',$$select public.sh_action('link_repair',sh_integration_test.state('repair')||'{"service_job_id":"61000000-0000-0000-0000-000000000005"}')$$,'Repair job must match');
select sh_integration_test.denied('null identifier cannot bypass matching',$$select public.sh_action('link_repair',sh_integration_test.state('repair')||'{"service_job_id":"61000000-0000-0000-0000-000000000004"}')$$,'Repair job must match');
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000003',true);
select sh_integration_test.assert('auditor sees no staff emails',public.sh_integration_choices('31000000-0000-0000-0000-000000000001')->'staff'='[]'::jsonb);
select sh_integration_test.denied('auditor cannot link repair',$$select public.sh_action('link_repair',sh_integration_test.state('repair'))$$,'read-only');
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
select sh_integration_test.assert('clerk sees no staff emails',public.sh_integration_choices('31000000-0000-0000-0000-000000000001')->'staff'='[]'::jsonb);
select public.sh_action('link_repair',sh_integration_test.state('repair'));
select public.sh_action('link_repair',sh_integration_test.state('repair'));
select sh_integration_test.denied('different repair cannot overwrite explicit link',$$select public.sh_action('link_repair',sh_integration_test.state('repair')||'{"service_job_id":"61000000-0000-0000-0000-000000000002"}')$$,'already has a linked');
select sh_integration_test.denied('cost cannot overwrite explicit repair link',$$select public.sh_action('add_cost',sh_integration_test.state('repair')||'{"service_job_id":"61000000-0000-0000-0000-000000000002","category":"parts","description":"Synthetic cost","amount":5}')$$,'already has a linked');
select public.sh_action('add_cost',sh_integration_test.state('repair')||'{"category":"parts","description":"Synthetic completed work","amount":5}');
reset role;
select sh_integration_test.assert('repair link is idempotent and audited once',(select count(*)=1 from nexus_sh.audit where action='repair_job_linked'));
select sh_integration_test.assert('link does not create fictitious refurbishment cost',(select count(*)=1 from nexus_sh.cost));
update public.service_job set serial_number='CORRECTED-EXCHANGE-SERIAL' where id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
select public.sh_action('flag',sh_integration_test.state('base')||jsonb_build_object('item_id',sh_integration_test.state('item')->>'id','reason','Synthetic later investigation'));
select sh_integration_test.denied('later quarantine blocks even linked repair',$$select public.sh_action('link_repair',sh_integration_test.state('repair'))$$,'Quarantined');
select sh_integration_test.denied('explicit link protects corrected job after quarantine',$$update public.service_job set status='diagnosing' where id='61000000-0000-0000-0000-000000000001'$$,'prevents repairs');
select sh_integration_test.denied('explicit link protects corrected job labour',$$insert into public.service_job_line(service_job_id) values('61000000-0000-0000-0000-000000000001')$$,'prevents repair parts');
-- Legacy trade-in intake remains compatible when no estimate links were requested.
insert into sh_integration_test.state values('legacy_trade',public.sh_action('acquire',(sh_integration_test.state('acquire')-'customer_id'-'replacement_inventory_item_id')||'{"serial_number":"LEGACY-EXCHANGE-SERIAL"}'));
insert into sh_integration_test.state values('excess_trade',public.sh_action('acquire',sh_integration_test.state('acquire')||'{"serial_number":"EXCESS-EXCHANGE-SERIAL","purchase_amount":800}'));
reset role;
select sh_integration_test.assert('legacy trade intake creates no invented estimate',not exists(select 1 from nexus_sh.trade_in where item_id=(sh_integration_test.state('legacy_trade')->>'id')::uuid));
select sh_integration_test.assert('excess allowance recorded without negative balance',(select balance_due=0 and excess_allowance=100 from nexus_sh.trade_in where item_id=(sh_integration_test.state('excess_trade')->>'id')::uuid));
insert into public.customer(company_id,customer_name,customer_number) select '21000000-0000-0000-0000-000000000001','Synthetic extra '||n,'CUS-EXTRA-'||n from generate_series(1,25) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
select sh_integration_test.assert('choices bounded to 20 customers',jsonb_array_length(public.sh_integration_choices('31000000-0000-0000-0000-000000000001')->'customers')=20);
select count(*) as passed_integration_assertions from sh_integration_test.results;
rollback;
