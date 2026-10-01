alter table public.repair_handover drop constraint repair_handover_verification_channel_check;
alter table public.repair_handover add constraint repair_handover_verification_channel_check check (verification_channel is null or verification_channel in ('sms','whatsapp','email','in_person'));
create or replace function public.repair_verify_handover_in_person(p_handover_id uuid,p_reason text,p_customer_present boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.repair_handover%rowtype; j public.service_job%rowtype; actor uuid:=auth.uid(); company uuid:=public.current_company_id(); meta jsonb;
begin
 if actor is null or not coalesce(public.current_user_has_permission('repair.intake.confirm'),false) then raise exception 'Permission denied: repair.intake.confirm'; end if;
 if p_customer_present is distinct from true or length(trim(coalesce(p_reason,'')))<10 or length(p_reason)>1000 then raise exception 'Confirm the customer is present and record how you verified their identity (10–1000 characters).'; end if;
 select * into h from public.repair_handover where id=p_handover_id and company_id=company and handover_type='intake' for update;
 if not found then raise exception 'Handover not found.'; end if;
 if h.status='verified' then return jsonb_build_object('ok',true,'receipt_number',h.receipt_number,'already_verified',true); end if;
 if h.status<>'awaiting_otp' or h.signed_at is null or h.terms_accepted_at is null or h.signature_sha256 is null or h.signature_storage_path is null then raise exception 'Customer must accept the terms and sign first.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='repair-signatures' and name=h.signature_storage_path) then raise exception 'Saved signature is missing. Capture the signature again.'; end if;
 select * into j from public.service_job where id=h.service_job_id and company_id=company for update;
 if not found or j.status in ('closed','cancelled','collected') then raise exception 'This job cannot be intake-confirmed.'; end if;
 update public.repair_handover set status='verified',verification_channel='in_person',verification_destination_masked=null,otp_verified_at=null,verified_at=now(),verified_by=actor,receipt_issued_at=coalesce(receipt_issued_at,now()),updated_at=now() where id=h.id;
 update public.repair_handover_otp set status='expired',updated_at=now() where handover_id=h.id and company_id=company and status='pending';
 update public.service_job set intake_confirmed_at=now(),intake_confirmed_by=actor,intake_confirmation_method='in_person',intake_confirmation_reference=h.id::text,updated_at=now() where id=j.id;
 meta:=jsonb_build_object('handover_id',h.id,'channel','in_person','reason',trim(p_reason),'customer_present',true,'signature_sha256',h.signature_sha256,'signed_at',h.signed_at,'receipt_number',h.receipt_number);
 insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id) values(company,j.id,'digital_handover_verified','Customer verified in person by authorised staff; signed terms retained.',meta,actor);
 insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata) values(company,actor,'repair_handover_verified_in_person','repairs',j.id,'Customer verified in person; reason and staff identity recorded.',meta);
 return jsonb_build_object('ok',true,'receipt_number',h.receipt_number,'verified_at',now());
end $$;
revoke all on function public.repair_verify_handover_in_person(uuid,text,boolean) from public,anon;
grant execute on function public.repair_verify_handover_in_person(uuid,text,boolean) to authenticated;
