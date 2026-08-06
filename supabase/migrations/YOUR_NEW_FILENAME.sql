-- Secure user-profile creation for normal registrations and invitations.
--
-- New users must never automatically receive owner privileges.
-- Company and elevated role assignment will be performed by a trusted
-- server-side invitation workflow after the Auth user has been created.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profile (
    user_id,
    email,
    full_name,
    role,
    company_id
  )
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      'New User'
    ),
    'employee',
    null
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
