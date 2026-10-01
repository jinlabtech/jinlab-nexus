
create or replace function public.marketing_worker_materialize_due_series(
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_series public.marketing_campaign_series%rowtype;
  v_template public.communication_template_version%rowtype;
  v_campaign_id uuid;
  v_run_id uuid;
  v_rec record;
  v_occurrence_no integer;
  v_scheduled_for timestamptz;
  v_next_run timestamptz;
  v_subject text;
  v_total integer;
  v_eligible integer;
  v_skipped integer;
  v_queued integer;
  v_job_id uuid;
  v_idempotency_key text;
  v_processed integer := 0;
  v_prepared integer := 0;
  v_auto_queued integer := 0;
  v_empty integer := 0;
  v_failed integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  for v_series in
    select s.*
    from public.marketing_campaign_series s
    where s.enabled = true
      and s.status = 'active'
      and s.next_run_at is not null
      and s.next_run_at <= now()
    order by s.next_run_at, s.created_at
    for update skip locked
    limit v_limit
  loop
    v_occurrence_no := v_series.occurrence_count + 1;
    v_scheduled_for := v_series.next_run_at;
    v_campaign_id := null;
    v_run_id := null;
    v_total := 0;
    v_eligible := 0;
    v_skipped := 0;
    v_queued := 0;

    begin
      if v_series.max_occurrences is not null
         and v_series.occurrence_count >= v_series.max_occurrences
      then
        update public.marketing_campaign_series
        set enabled = false,
            status = 'completed',
            next_run_at = null,
            updated_at = now()
        where id = v_series.id
          and company_id = v_series.company_id;

        continue;
      end if;

      if v_series.ends_on is not null
         and (v_scheduled_for at time zone v_series.timezone)::date > v_series.ends_on
      then
        update public.marketing_campaign_series
        set enabled = false,
            status = 'completed',
            next_run_at = null,
            updated_at = now()
        where id = v_series.id
          and company_id = v_series.company_id;

        continue;
      end if;

      if not exists (
        select 1
        from public.email_account ea
        where ea.company_id = v_series.company_id
          and ea.id = v_series.email_account_id
          and ea.active = true
      ) then
        raise exception 'Recurring campaign mailbox is inactive';
      end if;

      if not exists (
        select 1
        from public.marketing_audience a
        where a.company_id = v_series.company_id
          and a.id = v_series.audience_id
          and a.status = 'active'
      ) then
        raise exception 'Recurring campaign audience is not active';
      end if;

      select tv.*
      into v_template
      from public.communication_template_version tv
      where tv.company_id = v_series.company_id
        and tv.id = v_series.template_version_id
        and tv.template_id = v_series.template_id
        and tv.status = 'published';

      if not found then
        raise exception 'Published recurring campaign template version not found';
      end if;

      v_subject :=
        nullif(
          btrim(
            coalesce(
              v_series.subject_override,
              v_template.subject_template,
              ''
            )
          ),
          ''
        );

      if v_subject is null then
        raise exception 'Recurring campaign subject is empty';
      end if;

      if nullif(btrim(coalesce(v_template.rendered_html, '')), '') is null
         and nullif(btrim(coalesce(v_template.rendered_text, '')), '') is null
      then
        raise exception 'Recurring campaign template has no rendered body';
      end if;

      insert into public.marketing_campaign_series_run (
        company_id,
        series_id,
        occurrence_no,
        scheduled_for,
        status,
        metadata
      )
      values (
        v_series.company_id,
        v_series.id,
        v_occurrence_no,
        v_scheduled_for,
        'planned',
        jsonb_build_object(
          'source', 'recurring_scheduler'
        )
      )
      returning id into v_run_id;

      insert into public.email_campaign (
        company_id,
        branch_id,
        name,
        description,
        email_account_id,
        template_id,
        template_version_id,
        audience_id,
        status,
        subject_override,
        preheader_override,
        scheduled_at,
        timezone,
        requires_approval,
        approved_by,
        approved_at,
        track_opens,
        track_clicks,
        settings,
        created_by
      )
      values (
        v_series.company_id,
        v_series.branch_id,
        left(v_series.name || ' · Run ' || v_occurrence_no::text, 160),
        v_series.description,
        v_series.email_account_id,
        v_series.template_id,
        v_series.template_version_id,
        v_series.audience_id,
        'draft',
        v_series.subject_override,
        v_series.preheader_override,
        v_scheduled_for,
        v_series.timezone,
        v_series.requires_approval,
        null,
        null,
        v_series.track_opens,
        v_series.track_clicks,
        coalesce(v_series.settings, '{}'::jsonb) ||
          jsonb_build_object(
            'recurring_series_id', v_series.id,
            'recurring_run_id', v_run_id,
            'occurrence_no', v_occurrence_no
          ),
        v_series.created_by
      )
      returning id into v_campaign_id;

      update public.marketing_campaign_series_run
      set campaign_id = v_campaign_id,
          status = 'created',
          updated_at = now()
      where id = v_run_id
        and company_id = v_series.company_id;

      insert into public.email_campaign_recipient (
        company_id,
        campaign_id,
        customer_id,
        email_address,
        display_name,
        variables,
        consent_status,
        suppression_reason,
        send_status
      )
      select
        v_series.company_id,
        v_campaign_id,
        m.customer_id,
        lower(btrim(m.email_address)),
        m.display_name,
        coalesce(m.variables, '{}'::jsonb),
        coalesce(cons.status, 'unknown'),
        supp.reason,
        case
          when supp.id is not null then 'skipped'
          when cons.status = 'granted' then 'pending'
          else 'skipped'
        end
      from public.marketing_audience_member m
      left join lateral (
        select c.id, c.status
        from public.communication_consent c
        where c.company_id = v_series.company_id
          and c.channel = 'email'
          and c.purpose = 'marketing'
          and lower(c.address) = lower(m.email_address)
        order by c.updated_at desc
        limit 1
      ) cons on true
      left join lateral (
        select s.id, s.reason
        from public.communication_suppression s
        where s.company_id = v_series.company_id
          and s.channel = 'email'
          and s.active = true
          and s.scope in ('marketing','all')
          and lower(s.address) = lower(m.email_address)
        order by s.created_at desc
        limit 1
      ) supp on true
      where m.company_id = v_series.company_id
        and m.audience_id = v_series.audience_id
        and m.member_status = 'active';

      select
        count(*),
        count(*) filter (where send_status = 'pending'),
        count(*) filter (where send_status = 'skipped')
      into v_total, v_eligible, v_skipped
      from public.email_campaign_recipient
      where company_id = v_series.company_id
        and campaign_id = v_campaign_id;

      if v_eligible = 0 then
        update public.email_campaign
        set status = 'completed',
            updated_at = now()
        where id = v_campaign_id
          and company_id = v_series.company_id;

        update public.marketing_campaign_series_run
        set status = 'skipped',
            metadata =
              metadata ||
              jsonb_build_object(
                'recipient_count', v_total,
                'eligible_count', v_eligible,
                'skipped_count', v_skipped,
                'reason', 'no_eligible_recipients'
              ),
            updated_at = now()
        where id = v_run_id
          and company_id = v_series.company_id;

        v_empty := v_empty + 1;

      elsif v_series.requires_approval then
        update public.email_campaign
        set status = 'ready',
            updated_at = now()
        where id = v_campaign_id
          and company_id = v_series.company_id;

        update public.marketing_campaign_series_run
        set status = 'prepared',
            metadata =
              metadata ||
              jsonb_build_object(
                'recipient_count', v_total,
                'eligible_count', v_eligible,
                'skipped_count', v_skipped,
                'approval_required', true
              ),
            updated_at = now()
        where id = v_run_id
          and company_id = v_series.company_id;

        v_prepared := v_prepared + 1;

      else
        for v_rec in
          select r.*
          from public.email_campaign_recipient r
          where r.company_id = v_series.company_id
            and r.campaign_id = v_campaign_id
            and r.send_status = 'pending'
          order by r.created_at, r.id
          for update
        loop
          v_idempotency_key :=
            'marketing:' || v_campaign_id::text ||
            ':recipient:' || v_rec.id::text;

          insert into public.communication_send_job (
            company_id,
            branch_id,
            channel,
            purpose,
            source_type,
            source_id,
            email_account_id,
            template_version_id,
            recipient_address,
            recipient_display_name,
            subject,
            rendered_html,
            rendered_text,
            variables,
            idempotency_key,
            status,
            priority,
            scheduled_at,
            provider,
            created_by
          )
          values (
            v_series.company_id,
            v_series.branch_id,
            'email',
            'marketing',
            'email_campaign',
            v_campaign_id,
            v_series.email_account_id,
            v_series.template_version_id,
            lower(btrim(v_rec.email_address)),
            v_rec.display_name,
            v_subject,
            v_template.rendered_html,
            v_template.rendered_text,
            coalesce(v_rec.variables, '{}'::jsonb) ||
              jsonb_build_object(
                'campaign_id', v_campaign_id,
                'campaign_recipient_id', v_rec.id,
                'recurring_series_id', v_series.id,
                'recurring_run_id', v_run_id,
                'preheader',
                  coalesce(
                    v_series.preheader_override,
                    v_template.preheader_template
                  )
              ),
            v_idempotency_key,
            'queued',
            100,
            v_scheduled_for,
            null,
            v_series.created_by
          )
          returning id into v_job_id;

          update public.email_campaign_recipient
          set send_status = 'queued',
              consent_status = 'granted',
              suppression_reason = null,
              queued_at = now(),
              last_error = null,
              updated_at = now()
          where id = v_rec.id
            and company_id = v_series.company_id;

          v_queued := v_queued + 1;
          v_job_id := null;
        end loop;

        update public.email_campaign
        set status = 'processing',
            updated_at = now()
        where id = v_campaign_id
          and company_id = v_series.company_id;

        update public.marketing_campaign_series_run
        set status = 'queued',
            metadata =
              metadata ||
              jsonb_build_object(
                'recipient_count', v_total,
                'eligible_count', v_eligible,
                'skipped_count', v_skipped,
                'queued_count', v_queued,
                'approval_required', false
              ),
            updated_at = now()
        where id = v_run_id
          and company_id = v_series.company_id;

        v_auto_queued := v_auto_queued + 1;
      end if;

      v_next_run :=
        public.marketing_compute_next_series_run(
          v_series.recurrence_type,
          v_series.recurrence_interval,
          v_series.weekdays,
          v_series.day_of_month,
          v_series.send_time,
          v_series.timezone,
          v_series.starts_on,
          v_scheduled_for
        );

      if v_series.ends_on is not null
         and v_next_run is not null
         and (v_next_run at time zone v_series.timezone)::date > v_series.ends_on
      then
        v_next_run := null;
      end if;

      if v_series.max_occurrences is not null
         and v_occurrence_no >= v_series.max_occurrences
      then
        v_next_run := null;
      end if;

      update public.marketing_campaign_series
      set occurrence_count = v_occurrence_no,
          last_run_at = v_scheduled_for,
          next_run_at = v_next_run,
          enabled = (v_next_run is not null),
          status = case
            when v_next_run is null then 'completed'
            else 'active'
          end,
          updated_at = now()
      where id = v_series.id
        and company_id = v_series.company_id;

      insert into public.audit_log (
        company_id,
        user_id,
        action,
        module,
        record_id,
        description,
        metadata
      )
      values (
        v_series.company_id,
        null,
        'materialize_recurring_run',
        'marketing',
        v_campaign_id,
        'Recurring email marketing occurrence materialized',
        jsonb_build_object(
          'series_id', v_series.id,
          'run_id', v_run_id,
          'occurrence_no', v_occurrence_no,
          'scheduled_for', v_scheduled_for,
          'recipient_count', v_total,
          'eligible_count', v_eligible,
          'queued_count', v_queued,
          'approval_required', v_series.requires_approval,
          'next_run_at', v_next_run
        )
      );

      v_processed := v_processed + 1;

    exception
      when others then
        update public.marketing_campaign_series
        set enabled = false,
            status = 'failed',
            next_run_at = null,
            updated_at = now()
        where id = v_series.id
          and company_id = v_series.company_id;

        insert into public.marketing_campaign_series_run (
          company_id,
          series_id,
          occurrence_no,
          scheduled_for,
          status,
          error_message,
          metadata
        )
        values (
          v_series.company_id,
          v_series.id,
          v_occurrence_no,
          v_scheduled_for,
          'failed',
          left(sqlerrm, 2000),
          jsonb_build_object(
            'source', 'recurring_scheduler'
          )
        )
        on conflict (company_id, series_id, occurrence_no)
        do update
          set status = 'failed',
              error_message = excluded.error_message,
              updated_at = now();

        insert into public.audit_log (
          company_id,
          user_id,
          action,
          module,
          record_id,
          description,
          metadata
        )
        values (
          v_series.company_id,
          null,
          'recurring_run_failed',
          'marketing',
          v_series.id,
          'Recurring email marketing occurrence failed to materialize',
          jsonb_build_object(
            'series_id', v_series.id,
            'occurrence_no', v_occurrence_no,
            'scheduled_for', v_scheduled_for,
            'error', left(sqlerrm, 1000)
          )
        );

        v_failed := v_failed + 1;
        v_errors :=
          v_errors ||
          jsonb_build_array(
            jsonb_build_object(
              'series_id', v_series.id,
              'error', left(sqlerrm, 1000)
            )
          );
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed_count', v_processed,
    'prepared_for_approval_count', v_prepared,
    'auto_queued_count', v_auto_queued,
    'empty_count', v_empty,
    'failed_count', v_failed,
    'errors', v_errors
  );
end;
$$;

revoke all on function public.marketing_worker_materialize_due_series(integer)
from public, anon, authenticated;

grant execute on function public.marketing_worker_materialize_due_series(integer)
to service_role;
;
