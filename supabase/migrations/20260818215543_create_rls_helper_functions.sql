-- ============================================================
-- JINLAB Nexus
-- Shared RLS Helper Functions
-- ============================================================

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select company_id
    from public.user_profile
    where user_id = auth.uid()
    limit 1;
$$;

grant execute
on function public.current_company_id()
to authenticated;

