-- Meaningful security/workflow checks. Run ONLY on an isolated test database after
-- secondhand-local-fixture.sql and the migration. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
create schema sh_test;
create table sh_test.state(key text primary key,value jsonb);
create table sh_test.results(name text,passed boolean);
grant usage on schema sh_test to authenticated,anon;
grant all on all tables in schema sh_test to authenticated,anon;
create function sh_test.assert(p_name text,p_ok boolean) returns void language plpgsql as $$begin if p_ok is not true then raise exception 'FAIL: %',p_name; end if; insert into sh_test.results values(p_name,true); end$$;
create function sh_test.denied(p_name text,p_sql text,p_expected text) returns void language plpgsql as $$
declare v_failed boolean:=false;
begin
 begin execute p_sql; exception when others then v_failed:=true; if p_expected in ('controlled by Second-hand','prevents repairs','prevents repair parts') and sqlstate<>'42501' then raise exception 'FAIL: % unexpected SQLSTATE %',p_name,sqlstate; end if; if sqlerrm not ilike '%'||p_expected||'%' then raise exception 'FAIL: % unexpected error %',p_name,sqlerrm; end if; end;
 perform sh_test.assert(p_name,v_failed);
end$$;
create function sh_test.payload(p_key text) returns jsonb language sql as $$select value from sh_test.state where key=p_key$$;
create function sh_test.item() returns uuid language sql as $$select (value->>'id')::uuid from sh_test.state where key='item'$$;
grant execute on all functions in schema sh_test to authenticated,anon;

insert into auth.users(id,email) values
('10000000-0000-0000-0000-000000000001','owner@example.test'),
('10000000-0000-0000-0000-000000000002','clerk@example.test'),
('10000000-0000-0000-0000-000000000003','auditor@example.test'),
('10000000-0000-0000-0000-000000000004','outsider@example.test');
insert into public.company(id,company_name) values('20000000-0000-0000-0000-000000000001','Test company');
insert into public.branch(id,company_id,branch_name) values
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Branch A'),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Branch B');
insert into nexus_sh.access(user_id,branch_id,company_id,branch_name,role) values('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Branch A','owner');
insert into sh_test.state values ('base','{"branch_id":"30000000-0000-0000-0000-000000000001"}'),
('party','{"branch_id":"30000000-0000-0000-0000-000000000001","kind":"seller","full_name":"Synthetic Adult","id_type":"passport","id_number":"TESTDOC98765","date_of_birth":"1990-01-01","address":"Synthetic test address","phone":"0123456789","original_id_sighted":true,"id_copy_reference":"Locked cabinet test file","verification_reference":"Original passport sighted in person"}'),
('policy','{"branch_id":"30000000-0000-0000-0000-000000000001","hold_days":8,"legal_review_reference":"Synthetic legal review","registration_reference":"Synthetic registration","premises_confirmed":true,"goods_scope_confirmed":true}');
set local role anon;
select sh_test.denied('anonymous cannot invoke navigation','select public.sh_navigation_access()','permission denied');
select sh_test.denied('anonymous cannot invoke workspace','select public.sh_workspace(null)','permission denied');
select sh_test.denied('anonymous cannot read PII','select * from nexus_sh.party','permission denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select sh_test.assert('ungranted user has no navigation',not public.sh_navigation_access());
select sh_test.assert('ungranted workspace has no rows',(public.sh_workspace(null)->>'access_required')::boolean);
insert into public.user_profile values('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','owner');
select sh_test.assert('forged legacy owner profile cannot grant access',not public.sh_navigation_access());
select sh_test.denied('ungranted action denied',$$select public.sh_action('party_create',sh_test.payload('party'))$$,'not granted');
select sh_test.denied('direct PII reads denied','select * from nexus_sh.party','permission denied');
select sh_test.denied('direct access escalation denied',$$insert into nexus_sh.access(user_id,branch_id,company_id,branch_name,role) values(auth.uid(),'30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','A','owner')$$,'permission denied');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select sh_test.assert('trusted owner has navigation',public.sh_navigation_access());
select sh_test.assert('default hold is eight days',(public.sh_workspace(null)->'policy'->>'hold_days')::integer=8);
select sh_test.denied('cross branch workspace denied',$$select public.sh_workspace('30000000-0000-0000-0000-000000000002')$$,'not granted');
select sh_test.denied('underage seller denied',$$select public.sh_action('party_create',sh_test.payload('party')||jsonb_build_object('date_of_birth',current_date-interval '17 years'))$$,'18 or older');
select sh_test.denied('unsighted original ID safely rejected',$$select public.sh_action('party_create',sh_test.payload('party')||'{"original_id_sighted":false}'::jsonb)$$,'Sight the original');
select sh_test.denied('missing physical evidence denied',$$select public.sh_action('party_create',sh_test.payload('party')-'id_copy_reference')$$,'id_copy_reference');
insert into sh_test.state values('seller',public.sh_action('party_create',sh_test.payload('party')));
insert into sh_test.state values('buyer',public.sh_action('party_create',sh_test.payload('party')||'{"kind":"buyer","full_name":"Synthetic Buyer"}'));
insert into sh_test.state values('acquire',sh_test.payload('base')||jsonb_build_object('seller_id',sh_test.payload('seller')->>'id','description','Test laptop with scratches','brand','Test','model','Laptop','serial_number','TEST-SERIAL-001','condition','Used good condition','purchase_amount',100,'valuation_amount',150,'acquired_at',now()-interval '10 days','acquisition_reference','Synthetic handover evidence','ownership_reference','Synthetic proof of purchase','ownership_declared',true,'screening_result','clear','screening_source','Synthetic blacklist check','screening_reference','Test evidence 001','staff_attestation','Test Owner attests','communications_device',false,'acquisition_type','purchase'));
select sh_test.denied('certificate setup required before intake',$$select public.sh_action('acquire',sh_test.payload('acquire'))$$,'record registration');
select sh_test.denied('hold below minimum denied',$$select public.sh_action('policy_update',sh_test.payload('policy')||'{"hold_days":6}')$$,'7–365');
select public.sh_action('policy_update',sh_test.payload('policy'));
select sh_test.denied('missing ownership declaration denied',$$select public.sh_action('acquire',sh_test.payload('acquire')||'{"ownership_declared":false}')$$,'ownership');
select sh_test.denied('NaN purchase denied',$$select public.sh_action('acquire',sh_test.payload('acquire')||'{"purchase_amount":"NaN"}')$$,'check constraint');
select sh_test.denied('NaN valuation denied',$$select public.sh_action('acquire',sh_test.payload('acquire')||'{"valuation_amount":"NaN"}')$$,'check constraint');
select sh_test.denied('future acquisition denied',$$select public.sh_action('acquire',sh_test.payload('acquire')||jsonb_build_object('acquired_at',now()+interval '1 hour'))$$,'actual');
select sh_test.denied('communications equipment IMEI required',$$select public.sh_action('acquire',sh_test.payload('acquire')||'{"communications_device":true}')$$,'IMEI');
insert into public.service_job(id,company_id,branch_id,serial_number,status) values('60000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','TEST-SERIAL-001','received');
insert into public.service_job_line(id,service_job_id) values('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000003');
insert into sh_test.state values('item',public.sh_action('acquire',sh_test.payload('acquire')));
select sh_test.denied('preexisting job cannot add labour during hold',$$insert into public.service_job_line(service_job_id) values('60000000-0000-0000-0000-000000000003')$$,'prevents repair parts');
select sh_test.denied('preexisting job cannot add ordinary part during hold',$$insert into public.service_job_line(service_job_id,inventory_item_id) values('60000000-0000-0000-0000-000000000003',gen_random_uuid())$$,'prevents repair parts');
select sh_test.denied('existing repair line cannot escape held parent',$$update public.service_job_line set service_job_id=null where id='61000000-0000-0000-0000-000000000001'$$,'prevents repair parts');
select sh_test.denied('existing repair line deletion during hold denied',$$delete from public.service_job_line where id='61000000-0000-0000-0000-000000000001'$$,'prevents repair parts');

select sh_test.assert('backdated acquisition cannot shorten hold',(public.sh_workspace(null)->'items'->0->>'hold_until')::timestamptz>=now()+interval '8 days');
select sh_test.assert('workspace masks full identity',public.sh_workspace(null)::text not like '%TESTDOC98765%');
select sh_test.denied('duplicate serial intake denied',$$select public.sh_action('acquire',sh_test.payload('acquire'))$$,'already in the register');
select sh_test.denied('item timestamp direct edit denied',$$update nexus_sh.item set hold_until=now() where id=sh_test.item()$$,'permission denied');
select public.sh_action('approve',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'staff_attestation','Test owner approval'));
select sh_test.denied('release before hold denied',$$select public.sh_action('release',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'staff_attestation','Test owner'))$$,'holding period');
select sh_test.denied('refurbishment before hold denied',$$select public.sh_action('add_cost',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'category','parts','description','Test replacement','amount',10))$$,'holding period');
select sh_test.denied('legacy Repairs same-device hold bypass denied',$$insert into public.service_job(company_id,branch_id,serial_number,status) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','TEST-SERIAL-001','repairing')$$,'prevents repairs');
insert into public.service_job(id,company_id,branch_id,serial_number,status) values('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','UNRELATED-DEVICE','repairing');
select sh_test.assert('unrelated legacy Repairs unaffected',exists(select 1 from public.service_job where serial_number='UNRELATED-DEVICE'));
select sh_test.denied('repair changing into held identifier denied',$$update public.service_job set serial_number='TEST-SERIAL-001' where id='60000000-0000-0000-0000-000000000001'$$,'prevents repairs');
insert into sh_test.state values('quarantined',public.sh_action('acquire',sh_test.payload('acquire')||'{"serial_number":"TEST-FLAGGED-001","screening_result":"flagged","flag_reason":"Original synthetic intake concern"}'));
select sh_test.denied('quarantined owner override denied',$$select public.sh_action('approve',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.payload('quarantined')->>'id','staff_attestation','Test owner'))$$,'Only clear');
select public.sh_action('flag',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.payload('quarantined')->>'id','reason','Subsequent synthetic concern'));
select sh_test.assert('initial quarantine evidence survives subsequent flags',public.sh_register_export('30000000-0000-0000-0000-000000000001')::text like '%Original synthetic intake concern%');
select public.sh_action('report_saps',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.payload('quarantined')->>'id','reference','Synthetic SAPS OB reference'));
select public.sh_action('grant_access',sh_test.payload('base')||'{"user_id":"10000000-0000-0000-0000-000000000002","role":"clerk"}');
select public.sh_action('grant_access',sh_test.payload('base')||'{"user_id":"10000000-0000-0000-0000-000000000003","role":"auditor"}');
select sh_test.denied('owner role escalation grant denied',$$select public.sh_action('grant_access',sh_test.payload('base')||'{"user_id":"10000000-0000-0000-0000-000000000004","role":"owner"}')$$,'clerk or auditor');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select sh_test.assert('granted clerk has navigation',public.sh_navigation_access());
select sh_test.denied('clerk cannot approve',$$select public.sh_action('approve',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item()))$$,'Owner approval');
select sh_test.denied('clerk cannot export sensitive IDs',$$select public.sh_register_export('30000000-0000-0000-0000-000000000001')$$,'not granted');
select sh_test.denied('clerk cannot edit policy',$$select public.sh_action('policy_update',sh_test.payload('policy'))$$,'Owner approval');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select sh_test.assert('auditor sees masked workspace',jsonb_array_length(public.sh_workspace(null)->'items')=2);
select sh_test.denied('auditor cannot create parties',$$select public.sh_action('party_create',sh_test.payload('party'))$$,'read-only');
select sh_test.assert('audited export includes statutory full identity',public.sh_register_export('30000000-0000-0000-0000-000000000001')::text like '%TESTDOC98765%');
reset role;
select sh_test.assert('export creates immutable audit event',exists(select 1 from nexus_sh.audit where action='sensitive_register_export'));
select sh_test.denied('audit cannot be edited even accidentally by admin',$$update nexus_sh.audit set action='erase'$$,'append-only');
select sh_test.assert('all new tables have RLS',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='nexus_sh' and c.relkind='r' and not c.relrowsecurity));
select sh_test.assert('raw IDs absent from audit',not exists(select 1 from nexus_sh.audit where details::text like '%TESTDOC98765%'));
-- Only the isolated test administrator advances a fixture's clock; no production RPC can do so.
alter table nexus_sh.item disable trigger sh_item_immutable;
update nexus_sh.item set recorded_at=now()-interval '9 days',acquired_at=now()-interval '10 days',hold_until=now()-interval '1 day' where id=sh_test.item();
alter table nexus_sh.item enable trigger sh_item_immutable;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.sh_action('release',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'staff_attestation','Owner release attestation'));
select sh_test.denied('NaN refurbishment cost denied',$$select public.sh_action('add_cost',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'category','parts','description','Replacement','amount','NaN'))$$,'check constraint');
insert into public.service_job(id,company_id,branch_id,serial_number,status) values('60000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','TEST-SERIAL-001','repairing');
select sh_test.denied('repair branch mismatch denied',$$update public.service_job set branch_id='30000000-0000-0000-0000-000000000002' where id='60000000-0000-0000-0000-000000000002'$$,'prevents repairs');
select public.sh_action('add_cost',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'category','parts','description','Replacement test part','amount',20,'service_job_id','60000000-0000-0000-0000-000000000002'));
insert into public.service_job_line(service_job_id) values('60000000-0000-0000-0000-000000000003');
select sh_test.assert('released repair job permits labour',exists(select 1 from public.service_job_line where service_job_id='60000000-0000-0000-0000-000000000003'));
-- Prove explicit register linkage still applies after a permitted identifier correction.
update public.service_job set serial_number='CORRECTED-SERIAL' where id='60000000-0000-0000-0000-000000000002';
savepoint quarantine_test;
select public.sh_action('flag',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'reason','Synthetic later suspect report'));
select sh_test.denied('explicit repair link cannot evade later quarantine',$$update public.service_job set status='repairing' where id='60000000-0000-0000-0000-000000000002'$$,'prevents repairs');
select sh_test.denied('explicit repair link blocks later quarantined labour',$$insert into public.service_job_line(service_job_id) values('60000000-0000-0000-0000-000000000002')$$,'prevents repair parts');
rollback to quarantine_test;
select sh_test.assert('later quarantine repair and labour guards verified in rolled-back savepoint',true);
select public.sh_action('link_inventory',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'selling_price',200));
insert into sh_test.state select 'inventory',jsonb_build_object('id',i->>'inventory_item_id') from jsonb_array_elements(public.sh_workspace(null)->'items') i where i->>'id'=sh_test.item()::text;
select sh_test.assert('inventory cost includes refurbishment',(select cost_price=120 and is_active=false from public.inventory_item where id=(sh_test.payload('inventory')->>'id')::uuid));
select sh_test.denied('linked item cannot activate ordinary POS',$$update public.inventory_item set is_active=true where id=(sh_test.payload('inventory')->>'id')::uuid$$,'controlled by Second-hand');
select sh_test.denied('linked item cannot be deleted',$$delete from public.inventory_item where id=(sh_test.payload('inventory')->>'id')::uuid$$,'controlled by Second-hand');
select sh_test.denied('linked item cannot create stock movement',$$insert into public.stock_movement(company_id,branch_id,inventory_item_id,quantity) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',(sh_test.payload('inventory')->>'id')::uuid,1)$$,'controlled by Second-hand');
select public.sh_action('add_cost',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'category','labour','description','Final device test labour','amount',5));
select sh_test.assert('later refurbishment costs update inventory reference',(select cost_price=125 from public.inventory_item where id=(sh_test.payload('inventory')->>'id')::uuid));
select sh_test.denied('linked item cannot gain saleable stock',$$insert into public.branch_stock(company_id,branch_id,inventory_item_id,quantity) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',(sh_test.payload('inventory')->>'id')::uuid,1)$$,'controlled by Second-hand');
select sh_test.denied('linked item cannot enter ordinary POS',$$insert into public.pos_sale_item(inventory_item_id) values((sh_test.payload('inventory')->>'id')::uuid)$$,'controlled by Second-hand');
select sh_test.denied('linked item cannot enter ordinary invoice',$$insert into public.invoice_item(inventory_item_id) values((sh_test.payload('inventory')->>'id')::uuid)$$,'controlled by Second-hand');
select sh_test.denied('linked item cannot enter ordinary sales order',$$insert into public.sales_order_item(inventory_item_id) values((sh_test.payload('inventory')->>'id')::uuid)$$,'controlled by Second-hand');
select sh_test.denied('linked item cannot transfer branches',$$insert into public.inventory_stock_transfer_item(inventory_item_id) values((sh_test.payload('inventory')->>'id')::uuid)$$,'controlled by Second-hand');
select sh_test.denied('linked item cannot be consumed as repair part',$$insert into public.service_job_line(inventory_item_id) values((sh_test.payload('inventory')->>'id')::uuid)$$,'controlled by Second-hand');
select sh_test.denied('unverified buyer disposal denied',$$select public.sh_action('dispose',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'buyer_id',sh_test.payload('seller')->>'id','sale_amount',200,'invoice_reference','External invoice TEST','payment_reference','External payment TEST','staff_attestation','Owner attests'))$$,'verified buyer');
select public.sh_action('dispose',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'buyer_id',sh_test.payload('buyer')->>'id','sale_amount',200,'invoice_reference','External invoice TEST','payment_reference','External payment TEST','staff_attestation','Owner attests'));
select sh_test.denied('same item cannot be sold twice',$$select public.sh_action('dispose',sh_test.payload('base')||jsonb_build_object('item_id',sh_test.item(),'buyer_id',sh_test.payload('buyer')->>'id'))$$,'Only a released');
update public.service_job set status='completed' where id='60000000-0000-0000-0000-000000000002';
select sh_test.assert('sold device future Repairs remain possible',exists(select 1 from public.service_job where id='60000000-0000-0000-0000-000000000002' and status='completed'));
insert into public.inventory_item(id,company_id,item_name,sku,cost_price,selling_price) values('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Ordinary stock','ORD-001',10,15);
insert into public.branch_stock(company_id,branch_id,inventory_item_id,quantity) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',5);
insert into public.pos_sale_item(inventory_item_id) values('70000000-0000-0000-0000-000000000001');
select sh_test.assert('ordinary stock and POS inserts unaffected',exists(select 1 from public.pos_sale_item where inventory_item_id='70000000-0000-0000-0000-000000000001'));
insert into public.invoice_item(inventory_item_id) values('70000000-0000-0000-0000-000000000001');
insert into public.sales_order_item(inventory_item_id) values('70000000-0000-0000-0000-000000000001');
insert into public.inventory_stock_transfer_item(inventory_item_id) values('70000000-0000-0000-0000-000000000001');
insert into public.service_job_line(inventory_item_id) values('70000000-0000-0000-0000-000000000001');
insert into public.stock_movement(company_id,branch_id,inventory_item_id,quantity) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',1);
update public.inventory_item set selling_price=16 where id='70000000-0000-0000-0000-000000000001';
select sh_test.assert('ordinary invoice/order/transfer/repair-part/movement paths unaffected',
exists(select 1 from public.invoice_item where inventory_item_id='70000000-0000-0000-0000-000000000001') and
exists(select 1 from public.sales_order_item where inventory_item_id='70000000-0000-0000-0000-000000000001') and
exists(select 1 from public.inventory_stock_transfer_item where inventory_item_id='70000000-0000-0000-0000-000000000001') and
exists(select 1 from public.service_job_line where inventory_item_id='70000000-0000-0000-0000-000000000001') and
exists(select 1 from public.stock_movement where inventory_item_id='70000000-0000-0000-0000-000000000001') and
exists(select 1 from public.inventory_item where id='70000000-0000-0000-0000-000000000001' and selling_price=16));
select sh_test.denied('direct audit insertion denied',$$insert into nexus_sh.audit(branch_id,action,actor_id,actor_email) values('30000000-0000-0000-0000-000000000001','forge',auth.uid(),'fake')$$,'permission denied');
select sh_test.denied('private helper execution denied',$$select nexus_sh.log('30000000-0000-0000-0000-000000000001','forge')$$,'permission denied');
select public.sh_action('revoke_access',sh_test.payload('base')||'{"user_id":"10000000-0000-0000-0000-000000000002"}');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select sh_test.assert('revocation takes effect without token refresh',not public.sh_navigation_access());
reset role;
update auth.users set banned_until=now()+interval '1 day' where id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select sh_test.assert('banned account cannot use stale access token',not public.sh_navigation_access());
select sh_test.denied('banned account cannot mutate',$$select public.sh_action('party_create',sh_test.payload('party'))$$,'valid signed-in');
reset role;
select count(*) as passed_assertions from sh_test.results;
select name from sh_test.results order by name;
rollback;
